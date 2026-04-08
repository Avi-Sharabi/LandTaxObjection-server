import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { UpdateDisputeCaseDto } from './dto/update-dispute-case.dto';
import { CreateDisputeIntakeDto } from './dto/create-dispute-intake.dto';
import { CloseNoObjectionDto } from './dto/close-no-objection.dto';
import { SubmitToVgDto } from './dto/submit-to-vg.dto';
import { RecordVgResponseDto } from './dto/record-vg-response.dto';
import { DisputeCaseResponseDto } from './dto/dispute-case-response.dto';
import { ApprovalDocumentsResponseDto } from './dto/approval-documents-response.dto';
import { DisputeCase, DisputeStatus } from './entities/dispute-case.entity';
import { AuditAction, CaseAuditLog } from './entities/case-audit-log.entity';
import { DisputeIntakeOrchestrator } from './intake/dispute-intake.orchestrator';
import { ComparablesService } from '../comparables/comparables.service';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { PackageDocument, PackageDocumentStatus } from '../objection-package/entities/package-document.entity';

const CLOSED_STATUSES: DisputeStatus[] = [
  DisputeStatus.CLOSED,
  DisputeStatus.CLOSED_NO_OBJECTION,
];

@Injectable()
export class DisputeCasesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly intakeOrchestrator: DisputeIntakeOrchestrator,
    private readonly comparablesService: ComparablesService,
    private readonly azureEmailService: AzureEmailService,
    private readonly azureBlobService: AzureBlobService,
    private readonly config: ConfigService,
    @InjectRepository(DisputeCase)
    private disputeCasesRepository: Repository<DisputeCase>,
    @InjectRepository(PackageDocument)
    private readonly packageDocumentRepo: Repository<PackageDocument>,
  ) { }

  async submitIntakeApplication(intakeDto: CreateDisputeIntakeDto): Promise<unknown> {
    return this.intakeOrchestrator.submitIntakeApplication(intakeDto);
  }

  async findAll(): Promise<DisputeCaseResponseDto[]> {
    return await this.disputeCasesRepository.find()
  }

  async findOne(id: string): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id },
      relations: ['client', 'property', 'valuation_notice', 'assigned_accountant', 'assigned_lawyer', 'legal_grounds', 'dispute_constraints'],
    });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    return disputeCase;
  }

  async update(id: string, updateDisputeCaseDto: UpdateDisputeCaseDto): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({ where: { id } });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    Object.assign(disputeCase, updateDisputeCaseDto);
    return await this.disputeCasesRepository.save(disputeCase);
  }

  async advanceToAppraisal(id: string): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({ where: { id } });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    await this.comparablesService.assertMinimumComparables(id);
    disputeCase.status = DisputeStatus.APPRAISAL;
    return await this.disputeCasesRepository.save(disputeCase);
  }

  async closeNoObjection(caseId: string, dto: CloseNoObjectionDto): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id: caseId },
      relations: ['client', 'property', 'valuation_notice', 'assigned_accountant'],
    });

    if (!disputeCase) {
      throw new NotFoundException(`Dispute case #${caseId} not found`);
    }

    if (CLOSED_STATUSES.includes(disputeCase.status)) {
      throw new ConflictException(`Dispute case #${caseId} is already closed`);
    }

    const vgAssessedValue = Number(disputeCase.valuation_notice?.assessed_land_value ?? 0);

    if (dto.internalAssessmentValue < vgAssessedValue) {
      throw new ConflictException(
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
    const blobName = `cases/${caseId}/letters/advisory-${Date.now()}.html`;
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

    // Persist status transition
    disputeCase.status = DisputeStatus.CLOSED_NO_OBJECTION;
    disputeCase.closed_at = closedAtDate;
    disputeCase.advisory_letter_url = blobPath;
    if (dto.assessorNotes !== undefined) {
      disputeCase.notes = dto.assessorNotes;
    }

    return await this.disputeCasesRepository.save(disputeCase);
  }

  async sendObjectionPackage(caseId: string): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id: caseId },
      relations: ['client', 'property', 'valuation_notice'],
    });

    if (!disputeCase) {
      throw new NotFoundException(`Dispute case #${caseId} not found`);
    }

    if (disputeCase.client_approved_at !== null) {
      throw new ConflictException(`Dispute case #${caseId} has already been approved by the client`);
    }

    const token = randomUUID();
    const expires = new Date();
    expires.setDate(expires.getDate() + 3);

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';
    const approvalLink = `${frontendUrl}/approve-package?token=${token}`;
    const clientName = disputeCase.client.name;
    const propertyAddress = [disputeCase.property.address, disputeCase.property.suburb]
      .filter(Boolean)
      .join(', ');
    const taxYear = String(new Date(disputeCase.valuation_notice.valuation_date).getFullYear());

    // Send email first — only persist state if the send succeeds.
    await this.azureEmailService.sendObjectionPackageApproval({
      sendTo: disputeCase.client.email ?? '',
      clientName,
      propertyAddress,
      taxYear,
      approvalLink,
      firmName: this.config.get<string>('FIRM_NAME') ?? 'Your Firm',
      contactEmail: this.config.get<string>('CONTACT_EMAIL') ?? '',
    });

    disputeCase.client_approval_token = token;
    disputeCase.client_approval_token_expires_at = expires;
    disputeCase.status = DisputeStatus.AWAITING_CLIENT_APPROVAL;
    disputeCase.client_approval_requested_at = new Date();

    return await this.disputeCasesRepository.save(disputeCase);
  }

  async approveObjectionPackage(token: string): Promise<{ alreadyApproved: boolean; propertyAddress?: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock only the dispute_cases row — no JOINs, as PostgreSQL rejects
      // FOR UPDATE on the nullable side of a LEFT JOIN.
      const disputeCase = await queryRunner.manager.findOne(DisputeCase, {
        where: { client_approval_token: token },
        lock: { mode: 'pessimistic_write' },
      });

      if (!disputeCase) {
        throw new NotFoundException('Approval token is invalid or does not exist');
      }

      if (disputeCase.client_approved_at !== null) {
        await queryRunner.commitTransaction();
        return { alreadyApproved: true };
      }

      if (!disputeCase.client_approval_token_expires_at || disputeCase.client_approval_token_expires_at < new Date()) {
        throw new GoneException('Approval token has expired — please request a new package from your adviser');
      }

      disputeCase.client_approved_at = new Date();
      disputeCase.client_approval_token = null;
      disputeCase.client_approval_token_expires_at = null;
      disputeCase.status = DisputeStatus.CLIENT_APPROVED;

      await queryRunner.manager.save(disputeCase);
      await queryRunner.commitTransaction();

      // Fetch property address after commit — outside the locked transaction,
      // so relations are safe to join here.
      const withProperty = await this.disputeCasesRepository.findOne({
        where: { id: disputeCase.id },
        relations: ['property'],
      });

      const propertyAddress = [withProperty?.property?.address, withProperty?.property?.suburb]
        .filter(Boolean)
        .join(', ');

      return { alreadyApproved: false, propertyAddress };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async getApprovalDocuments(token: string): Promise<ApprovalDocumentsResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { client_approval_token: token },
      relations: ['property', 'valuation_notice'],
    });

    if (!disputeCase) {
      throw new NotFoundException('Approval token is invalid or does not exist');
    }

    if (!disputeCase.client_approval_token_expires_at || disputeCase.client_approval_token_expires_at < new Date()) {
      throw new GoneException('Approval token has expired — please request a new package from your adviser');
    }

    if (disputeCase.client_approved_at !== null) {
      return { alreadyApproved: true, documents: [] };
    }

    const docs = await this.packageDocumentRepo.find({
      where: { dispute_case_id: disputeCase.id, status: PackageDocumentStatus.READY },
    });

    const propertyAddress = [disputeCase.property.address, disputeCase.property.suburb]
      .filter(Boolean)
      .join(', ');
    const taxYear = String(new Date(disputeCase.valuation_notice.valuation_date).getFullYear());

    return {
      alreadyApproved: false,
      propertyAddress,
      taxYear,
      documents: docs
        .filter((doc): doc is PackageDocument & { blob_name: string } => doc.blob_name !== null)
        .map((doc) => ({
          id: doc.id,
          name: doc.name,
          viewUrl: this.azureBlobService.getFileUrl(doc.blob_name, 30),
        })),
    };
  }

  async remove(id: string): Promise<{ message: string }> {
    const disputeCase = await this.disputeCasesRepository.findOne({ where: { id } });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    await this.disputeCasesRepository.remove(disputeCase);
    return { message: `Dispute case #${id} removed` };
  }
}
