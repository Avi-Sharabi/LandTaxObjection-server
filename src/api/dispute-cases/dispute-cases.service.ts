import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AdvisoryLetterEmailFailedException } from './exceptions/advisory-letter-email-failed.exception';
import { ClientEmailMissingException } from './exceptions/client-email-missing.exception';
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

const CLOSED_STATUSES: DisputeStatus[] = [
  DisputeStatus.CLOSED,
  DisputeStatus.CLOSED_NO_OBJECTION,
];

@Injectable()
export class DisputeCasesService {
  private readonly logger = new Logger(DisputeCasesService.name);
  constructor(
    private readonly intakeOrchestrator: DisputeIntakeOrchestrator,
    private readonly comparablesService: ComparablesService,
    private readonly blobService: AzureBlobService,
    private readonly emailService: AzureEmailService,
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

    const originalStatus = disputeCase.status;
    const vgAssessedValue = Number(disputeCase.valuation_notice?.assessed_land_value ?? 0);

    if (dto.internalAssessmentValue < vgAssessedValue) {
      throw new BadRequestException(
        `Internal assessment value ($${dto.internalAssessmentValue.toLocaleString()}) is less than the VG assessed value ` +
        `($${vgAssessedValue.toLocaleString()}). The case has viable objection grounds and should not be closed without objection.`,
      );
    }

    // Build property address string
    const property = disputeCase.property;
    const propertyAddress = property
      ? `${property.address}, ${property.suburb} ${property.state} ${property.postcode}`
      : 'Address not available';

    // Format currency values
    const fmtCurrency = (val: number) =>
      `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const closedAtDate = new Date();
    const closedAtFormatted = closedAtDate.toLocaleString('en-AU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const attachments = await this.buildAttachments(caseId);

    // Guard: client must have an email before we commit anything
    const clientEmail = disputeCase.client?.email ?? '';
    if (!clientEmail) {
      throw new ClientEmailMissingException(disputeCase.case_reference);
    }

    // Persist status transition
    disputeCase.status = DisputeStatus.CLOSED_NO_OBJECTION;
    disputeCase.closed_at = closedAtDate;
    if (dto.assessorNotes !== undefined) {
      disputeCase.notes = dto.assessorNotes;
    }

    const saved = await this.disputeCasesRepository.save(disputeCase);

    // Send email — rollback DB status on failure
    await this.emailService
      .sendAdvisoryLetterNotification({
        caseReference: saved.case_reference,
        clientName: saved.client?.name ?? 'Client',
        clientEmail,
        propertyAddress,
        vgAssessedValue: fmtCurrency(vgAssessedValue),
        internalAssessedValue: fmtCurrency(dto.internalAssessmentValue),
        assessorFullName: saved.assigned_accountant?.fullName ?? 'YML Assessor',
        attachments,
        closedAt: closedAtFormatted,
      })
      .catch(async (err: Error) => {
        this.logger.error(
          `Advisory letter email failed for case ${saved.case_reference}: ${err.message}`,
          err.stack,
        );
        saved.status = originalStatus;
        saved.closed_at = null;
        await this.disputeCasesRepository.save(saved);
        throw new AdvisoryLetterEmailFailedException(saved.case_reference, err.message);
      });

    // TODO: Xero closure logging — Ticket 4 / future Xero integration placeholder

    return DisputeCaseResponseDto.fromEntity(saved);
  }

  async remove(id: string): Promise<{ message: string }> {
    const disputeCase = await this.findOne(id);
    await this.disputeCasesRepository.remove(disputeCase);
    return { message: `Dispute case #${id} removed` };
  }

  private async buildAttachments(caseId: string): Promise<{ name: string; contentType: string; contentInBase64: string }[]> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id: caseId },
      select: ['id', 'case_reference', 'analysis_report_blob_path'],
    });

    if (!disputeCase?.analysis_report_blob_path) return [];

    const pdfBuffer = await this.blobService.getFileContent(disputeCase.analysis_report_blob_path);
    return [
      {
        name: `valuation-analysis-${disputeCase.case_reference}.pdf`,
        contentType: 'application/pdf',
        contentInBase64: pdfBuffer.toString('base64'),
      },
    ];
  }
}
