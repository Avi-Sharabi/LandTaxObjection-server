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

const LODGMENT_REF_PREFIX = 'VG';

const VG_SUBMITTABLE_STATUSES: DisputeStatus[] = [
  DisputeStatus.SUBMITTED_TO_VG,
  DisputeStatus.AWAITING_VG_RESPONSE,
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
    @InjectRepository(CaseAuditLog)
    private readonly auditLogRepo: Repository<CaseAuditLog>,
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

    const fmtCurrency = (val: number) =>
      `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const property = disputeCase.property;
    const propertyAddress = property
      ? `${property.address}, ${property.suburb} ${property.state} ${property.postcode}`
      : 'Address not available';

    const closedAtDate = new Date();

    // Persist status transition before sending email
    disputeCase.status = DisputeStatus.CLOSED_NO_OBJECTION;
    disputeCase.closed_at = closedAtDate;
    if (dto.assessorNotes !== undefined) {
      disputeCase.notes = dto.assessorNotes;
    }

    const saved = await this.disputeCasesRepository.save(disputeCase);

    // Send notification email (fire-and-forget — do not block the response)
    const notifyEmail = this.config.get<string>('NOTIFY_EMAIL') ?? this.config.get<string>('CONTACT_EMAIL') ?? '';
    if (notifyEmail) {
      this.azureEmailService.sendAdvisoryLetterNotification({
        sendTo: notifyEmail,
        caseReference: disputeCase.case_reference,
        clientName: disputeCase.client?.name ?? 'Client',
        clientEmail: disputeCase.client?.email ?? '',
        propertyAddress,
        vgAssessedValue: fmtCurrency(vgAssessedValue),
        internalAssessedValue: fmtCurrency(dto.internalAssessmentValue),
        assessorFullName: disputeCase.assigned_accountant?.fullName ?? 'YML Assessor',
      }).catch(() => { /* email failure is non-fatal */ });
    }

    return saved;
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
        relations: ['property', 'client'],
      });

      const propertyAddress = [withProperty?.property?.address, withProperty?.property?.suburb]
        .filter(Boolean)
        .join(', ');

      // Notify assessor that the client has approved — fire-and-forget
      const assessorEmail = this.config.get<string>('ASSESSOR_EMAIL') ?? '';
      if (assessorEmail) {
        this.azureEmailService.sendClientApprovedNotification({
          sendTo: assessorEmail,
          caseReference: disputeCase.case_reference,
          clientName: withProperty?.client?.name ?? 'Client',
          propertyAddress,
          jurisdiction: disputeCase.jurisdiction,
          approvedAt: disputeCase.client_approved_at!.toLocaleString('en-AU', {
            day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
          }),
        }).catch(() => { /* email failure is non-fatal */ });
      }

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

  async submitToVg(
    caseId: string,
    dto: SubmitToVgDto,
  ): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id: caseId },
      relations: ['client', 'property', 'valuation_notice', 'assigned_accountant', 'assigned_lawyer', 'legal_grounds', 'dispute_constraints'],
    });

    if (!disputeCase) {
      throw new NotFoundException(`Dispute case #${caseId} not found`);
    }

    if (disputeCase.status === DisputeStatus.SUBMITTED_TO_VG || disputeCase.status === DisputeStatus.AWAITING_VG_RESPONSE) {
      throw new ConflictException(`Dispute case #${caseId} has already been submitted to the VG`);
    }

    if (!disputeCase.client_approved_at) {
      throw new ConflictException(`Dispute case #${caseId} has not been approved by the client`);
    }

    const submittedAt = new Date();
    const lodgmentReferenceNumber = `${LODGMENT_REF_PREFIX}-${disputeCase.case_reference}-${Date.now()}`;

    disputeCase.status = DisputeStatus.SUBMITTED_TO_VG;
    disputeCase.submitted_at = submittedAt;
    disputeCase.lodgment_reference_number = lodgmentReferenceNumber;
    if (dto.submissionNotes) {
      disputeCase.notes = dto.submissionNotes;
    }

    const saved = await this.disputeCasesRepository.save(disputeCase);

    // Notify assessor — fire-and-forget
    const notifyEmail = this.config.get<string>('ASSESSOR_EMAIL') ?? this.config.get<string>('CONTACT_EMAIL') ?? '';
    if (notifyEmail) {
      const property = disputeCase.property;
      const propertyAddress = property
        ? [property.address, property.suburb, property.state, property.postcode].filter(Boolean).join(', ')
        : 'Address not available';

      this.azureEmailService.sendSubmitToVgNotification({
        sendTo: notifyEmail,
        caseReference: disputeCase.case_reference,
        clientName: disputeCase.client?.name ?? 'Client',
        propertyAddress,
        jurisdiction: disputeCase.jurisdiction,
        lodgmentReferenceNumber,
        submittedAt: submittedAt.toLocaleString('en-AU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        assessorFullName: disputeCase.assigned_accountant?.fullName ?? 'YML Assessor',
      }).catch(() => { /* email failure is non-fatal */ });
    }

    return saved;
  }

  async recordVgResponse(
    caseId: string,
    dto: RecordVgResponseDto,
    assessorId: string,
  ): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id: caseId },
      relations: ['client', 'property', 'valuation_notice', 'assigned_accountant', 'assigned_lawyer', 'legal_grounds', 'dispute_constraints'],
    });

    if (!disputeCase) {
      throw new NotFoundException(`Dispute case #${caseId} not found`);
    }

    if (!VG_SUBMITTABLE_STATUSES.includes(disputeCase.status) && disputeCase.status !== DisputeStatus.VG_RESPONSE_RECEIVED) {
      throw new ConflictException(`Dispute case #${caseId} is not in a state that allows recording a VG response`);
    }

    if (disputeCase.status === DisputeStatus.VG_RESPONSE_RECEIVED) {
      throw new ConflictException(`VG response has already been recorded for dispute case #${caseId}`);
    }

    disputeCase.status = DisputeStatus.VG_RESPONSE_RECEIVED;
    disputeCase.vg_response_received_at = new Date(dto.responseDate);
    disputeCase.vg_response_notes = dto.responseNotes ?? null;
    if (dto.lodgmentReferenceNumber !== undefined) {
      disputeCase.lodgment_reference_number = dto.lodgmentReferenceNumber;
    }

    const saved = await this.disputeCasesRepository.save(disputeCase);

    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        case_id: caseId,
        action: AuditAction.VG_RESPONSE_RECORDED,
        performed_by: assessorId,
        response_notes: dto.responseNotes ?? null,
      }),
    );

    return saved;
  }

  async remove(id: string): Promise<{ message: string }> {
    const disputeCase = await this.disputeCasesRepository.findOne({ where: { id } });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    await this.disputeCasesRepository.remove(disputeCase);
    return { message: `Dispute case #${id} removed` };
  }
}
