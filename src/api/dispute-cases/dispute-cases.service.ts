import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDisputeCaseDto } from './dto/create-dispute-case.dto';
import { UpdateDisputeCaseDto } from './dto/update-dispute-case.dto';
import { CreateDisputeIntakeDto } from './dto/create-dispute-intake.dto';
import { CloseNoObjectionDto } from './dto/close-no-objection.dto';
import { DisputeCaseResponseDto } from './dto/dispute-case-response.dto';
import { DisputeCase, DisputeStatus } from './entities/dispute-case.entity';
import { DisputeIntakeOrchestrator } from './intake/dispute-intake.orchestrator';
import { ComparablesService } from '../comparables/comparables.service';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';
import { LetterGenerationService } from 'src/common/letter-generation/letter-generation.service';

const CLOSED_STATUSES: DisputeStatus[] = [
  DisputeStatus.CLOSED,
  DisputeStatus.CLOSED_NO_OBJECTION,
];

@Injectable()
export class DisputeCasesService {
  constructor(
    private readonly intakeOrchestrator: DisputeIntakeOrchestrator,
    private readonly comparablesService: ComparablesService,
    private readonly blobService: AzureBlobService,
    private readonly emailService: AzureEmailService,
    private readonly letterService: LetterGenerationService,
    @InjectRepository(DisputeCase)
    private disputeCasesRepository: Repository<DisputeCase>,
  ) { }

  create(_createDisputeCaseDto: CreateDisputeCaseDto) {
    return 'This action adds a new disputeCase';
  }

  async submitIntakeApplication(intakeDto: CreateDisputeIntakeDto) {
    return this.intakeOrchestrator.submitIntakeApplication(intakeDto);
  }

  async findAll(): Promise<DisputeCase[]> {
    return this.disputeCasesRepository.find();
  }

  async findOne(id: string): Promise<DisputeCase> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id },
      relations: ['client', 'property', 'valuation_notice', 'assigned_accountant', 'assigned_lawyer', 'legal_grounds', 'dispute_constraints'],
    });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    return disputeCase;
  }

  async findOneResponse(id: string): Promise<DisputeCase> {
    const disputeCase = await this.findOne(id);
    if (disputeCase.analysis_report_url) {
      disputeCase.analysis_report_url =
        this.blobService.getFileUrl(disputeCase.analysis_report_url, 1440) ?? null;
    }
    return disputeCase;
  }

  async update(id: string, updateDisputeCaseDto: UpdateDisputeCaseDto): Promise<DisputeCase> {
    const disputeCase = await this.findOne(id);
    Object.assign(disputeCase, updateDisputeCaseDto);
    return this.disputeCasesRepository.save(disputeCase);
  }

  async advanceToAppraisal(id: string): Promise<DisputeCase> {
    const disputeCase = await this.findOne(id);
    await this.comparablesService.assertMinimumComparables(id);
    disputeCase.status = DisputeStatus.APPRAISAL;
    return this.disputeCasesRepository.save(disputeCase);
  }

  async closeNoObjection(caseId: string, dto: CloseNoObjectionDto): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id: caseId },
      relations: [
        'client',
        'property',
        'valuation_notice',
        'assigned_accountant',
      ],
    });

    if (!disputeCase) {
      throw new NotFoundException(`Dispute case #${caseId} not found`);
    }

    if (CLOSED_STATUSES.includes(disputeCase.status)) {
      throw new ConflictException(`Dispute case #${caseId} is already closed`);
    }

    const vgAssessedValue = Number(disputeCase.valuation_notice?.assessed_land_value ?? 0);

    if (dto.internalAssessmentValue < vgAssessedValue) {
      throw new BadRequestException(
        `Internal assessment value ($${dto.internalAssessmentValue.toLocaleString()}) is less than the VG assessed value ` +
        `($${vgAssessedValue.toLocaleString()}). The case has viable objection grounds and should not be closed without objection.`,
      );
    }

    const originalStatus = disputeCase.status;

    // Build property address string
    const property = disputeCase.property;
    const propertyAddress = property
      ? `${property.address}, ${property.suburb} ${property.state} ${property.postcode}`
      : 'Address not available';

    // Format currency values
    const fmtCurrency = (val: number) =>
      `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Format assessment date
    const assessmentDate = disputeCase.valuation_notice?.valuation_date
      ? new Date(disputeCase.valuation_notice.valuation_date).toLocaleDateString('en-AU', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
      : 'N/A';

    const closedAtDate = new Date();
    const closedAtFormatted = closedAtDate.toLocaleString('en-AU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Generate case summary HTML
    const letterHtml = this.letterService.generateAdvisoryLetter({
      caseReference: disputeCase.case_reference,
      clientName: disputeCase.client?.name ?? 'Client',
      clientEmail: disputeCase.client?.email ?? '',
      propertyAddress,
      vgAssessedValue: fmtCurrency(vgAssessedValue),
      internalAssessedValue: fmtCurrency(dto.internalAssessmentValue),
      assessmentDate,
      assessorFullName: disputeCase.assigned_accountant?.fullName ?? 'YML Assessor',
      closedAt: closedAtFormatted,
    });

    // Upload case summary to Blob Storage
    const blobName = `cases/${disputeCase.case_reference}/letters/advisory-${Date.now()}.html`;
    const base64Html = Buffer.from(letterHtml, 'utf-8').toString('base64');
    const blobPath = await this.blobService.uploadFile(blobName, base64Html);
    if (!blobPath) {
      throw new InternalServerErrorException('Failed to upload advisory letter to Blob Storage.');
    }

    // Generate SAS URL now (needed in the notification email body)
    const sasUrl = this.blobService.getFileUrl(blobPath, 1440); // 24-hour expiry
    if (!sasUrl) {
      await this.blobService.deleteFile(blobPath);
      throw new InternalServerErrorException('Failed to generate advisory letter download URL.');
    }

    // ── Fetch static Valuation Analysis Report from Blob Storage ─────────
    const SAMPLE_REPORT_BLOB = 'cases/report/Sample Valuation Analysis Report.pdf';

    const pdfBuffer = await this.blobService.getFileContent(SAMPLE_REPORT_BLOB);
    const pdfBase64 = pdfBuffer.toString('base64');
    const pdfSasUrl = this.blobService.getFileUrl(SAMPLE_REPORT_BLOB, 1440);
    if (!pdfSasUrl) {
      await this.blobService.deleteFile(blobPath);
      throw new InternalServerErrorException('Failed to generate analysis report download URL.');
    }
    // ─────────────────────────────────────────────────────────────────────

    // Persist status transition
    disputeCase.status = DisputeStatus.CLOSED_NO_OBJECTION;
    disputeCase.closed_at = closedAtDate;
    disputeCase.advisory_letter_url = blobPath;
    disputeCase.analysis_report_url = SAMPLE_REPORT_BLOB;
    if (dto.assessorNotes !== undefined) {
      disputeCase.notes = dto.assessorNotes;
    }

    const saved = await this.disputeCasesRepository.save(disputeCase);

    // Notify Avi — if this fails, roll back the entire closure operation
    try {
      await this.emailService.sendAdvisoryLetterNotification({
        caseReference: saved.case_reference,
        clientName: saved.client?.name ?? 'Client',
        clientEmail: saved.client?.email ?? '',
        propertyAddress,
        vgAssessedValue: fmtCurrency(vgAssessedValue),
        internalAssessedValue: fmtCurrency(dto.internalAssessmentValue),
        assessorFullName: saved.assigned_accountant?.fullName ?? 'YML Assessor',
        advisoryLetterUrl: sasUrl,
        analysisReportUrl: pdfSasUrl,
        analysisPdfBase64: pdfBase64,
        closedAt: closedAtFormatted,
      });
    } catch {
      // Rollback: revert case status in DB and clean up the advisory letter blob
      saved.status = originalStatus;
      saved.closed_at = null;
      saved.advisory_letter_url = null;
      saved.analysis_report_url = null;
      await this.disputeCasesRepository.save(saved);
      await this.blobService.deleteFile(blobPath);
      throw new InternalServerErrorException(
        'Advisory letter notification email failed to send. The closure operation has been rolled back.',
      );
    }

    // TODO: Xero closure logging — Ticket 4 / future Xero integration placeholder

    return DisputeCaseResponseDto.fromEntity(saved);
  }

  async remove(id: string): Promise<{ message: string }> {
    const disputeCase = await this.findOne(id);
    await this.disputeCasesRepository.remove(disputeCase);
    return { message: `Dispute case #${id} removed` };
  }
}
