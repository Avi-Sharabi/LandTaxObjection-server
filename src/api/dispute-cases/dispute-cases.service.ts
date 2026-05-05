import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, FindOptionsWhere, ILike, In, LessThan, Not, Repository } from 'typeorm';
import { randomUUID, randomInt } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { GetDisputeCasesQueryDto } from '../../common/dto/paginated-query.dto';
import { PaginatedDisputeCasesResponseDto } from '../../common/dto/paginated-response.dto';
import { UpdateDisputeCaseDto } from './dto/update-dispute-case.dto';
import { CreateDisputeIntakeDto } from './dto/create-dispute-intake.dto';
import { CloseNoObjectionDto } from './dto/close-no-objection.dto';
import { SubmitToVgDto } from './dto/submit-to-vg.dto';
import { RecordVgResponseDto } from './dto/record-vg-response.dto';
import { DisputeCaseResponseDto } from './dto/dispute-case-response.dto';
import { AnalysisReportResponseDto } from './dto/analysis-report-response.dto';
import { ApprovalDocumentsResponseDto } from './dto/approval-documents-response.dto';
import { DisputeCase, DisputeStatus } from './entities/dispute-case.entity';
import { AuditAction as CaseAuditAction, CaseAuditLog } from './entities/case-audit-log.entity';
import { DisputeIntakeOrchestrator } from './intake/dispute-intake.orchestrator';
import { ComparablesService } from '../comparables/comparables.service';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { PackageDocument, PackageDocumentStatus } from '../objection-package/entities/package-document.entity';
import { ClientEmailMissingException } from './exceptions/client-email-missing.exception';
import { CaseNotClientApprovedException } from './exceptions/case-not-client-approved.exception';
import { CaseAlreadySubmittedException } from './exceptions/case-already-submitted.exception';
import { AuditLog, AuditAction } from '../audit-log/entities/audit-log.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

/** Nil UUID used as the actor ID for system-initiated audit log entries (e.g. cron jobs). */
const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

const MAX_VG_FOLLOW_UPS = 3;

const THREE_DAY_WINDOW_DAYS = 3;
const THREE_DAY_WINDOW_MINUTES = THREE_DAY_WINDOW_DAYS * 24 * 60;
const THREE_DAY_WINDOW_HOURS = THREE_DAY_WINDOW_DAYS * 24;

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
  private readonly logger = new Logger(DisputeCasesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly intakeOrchestrator: DisputeIntakeOrchestrator,
    private readonly comparablesService: ComparablesService,
    private readonly azureEmailService: AzureEmailService,
    private readonly azureBlobService: AzureBlobService,
    private readonly config: ConfigService,
    private readonly notificationsService: NotificationsService,
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

  async findAll(clientId?: string): Promise<DisputeCaseResponseDto[]> {
    return await this.disputeCasesRepository.find({
      where: clientId ? { client_id: clientId } : {},
    });
  }

  async findPaginated(query: GetDisputeCasesQueryDto): Promise<PaginatedDisputeCasesResponseDto> {
    const { page, limit, search, status, jurisdiction, clientId, dashboardFilter } = query;
    const skip = (page - 1) * limit;

    const { startOfToday, endOf7Days } = DisputeCasesService.getDueThisWeekWindow();

    const statusWhere = (() => {
      if (status) {
        return { status };
      }
      if (dashboardFilter) {
        return { status: Not(In(CLOSED_STATUSES)) };
      }
      return {};
    })();

    const deadlineWhere = DisputeCasesService.resolveDeadlineWhere(dashboardFilter, startOfToday, endOf7Days);

    const baseWhere: FindOptionsWhere<DisputeCase> = {
      ...(clientId && { client_id: clientId }),
      ...statusWhere,
      ...(jurisdiction && { jurisdiction }),
      ...deadlineWhere,
    };

    const where: FindOptionsWhere<DisputeCase>[] = search
      ? [{ ...baseWhere, case_reference: ILike(`%${search}%`) }]
      : [baseWhere];

    const [data, total] = await this.disputeCasesRepository.findAndCount({
      where,
      select: {
        id: true,
        case_reference: true,
        client_id: true,
        jurisdiction: true,
        status: true,
        statutory_deadline: true,
        original_assessed_value: true,
        vg_follow_up_count: true,
        reminder_count: true,
        created_at: true,
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id },
      relations: ['client', 'property', 'valuation_notice', 'assigned_accountant', 'assigned_lawyer', 'legal_grounds', "dispute_constraints"],
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
      throw new ConflictException(
        `Internal assessment value ($${dto.internalAssessmentValue.toLocaleString()}) is less than the VG assessed value ` +
        `($${vgAssessedValue.toLocaleString()}). The case has viable objection grounds and should not be closed without objection.`,
      );
    }

    const closedAtDate = new Date();
    const token = randomUUID();
    const tokenExpiry = new Date(closedAtDate);
    tokenExpiry.setDate(tokenExpiry.getDate() + THREE_DAY_WINDOW_DAYS);
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';
    const viewReportUrl = `${frontendUrl}/advisory-view?token=${token}`;

    // Persist status transition before sending email
    disputeCase.status = DisputeStatus.CLOSED_NO_OBJECTION;
    disputeCase.closed_at = closedAtDate;
    disputeCase.advisory_view_token = token;
    disputeCase.advisory_view_token_expires_at = tokenExpiry;
    if (dto.assessorNotes !== undefined) {
      disputeCase.notes = dto.assessorNotes;
    }

    const saved = await this.disputeCasesRepository.save(disputeCase);

    this.azureEmailService
      .sendAdvisoryLetterNotification(
        this.buildAdvisoryEmailPayload(disputeCase, dto, vgAssessedValue, closedAtDate, viewReportUrl),
      )
      .catch((err: unknown) => {
        this.logger.error(
          `Advisory letter email failed for case ${disputeCase.case_reference}: ${String(err)}`,
        );
      });

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
    expires.setDate(expires.getDate() + THREE_DAY_WINDOW_DAYS);

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';
    const approvalLink = `${frontendUrl}/approve-package?token=${token}`;
    const clientName = disputeCase.client.name;
    const propertyAddress = this.buildPropertyAddress(disputeCase.property);
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

      if (DisputeCasesService.isExpired(disputeCase.client_approval_token_expires_at)) {
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

      const propertyAddress = this.buildPropertyAddress(withProperty?.property ?? null);

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

    if (DisputeCasesService.isExpired(disputeCase.client_approval_token_expires_at)) {
      throw new GoneException('Approval token has expired — please request a new package from your adviser');
    }

    if (disputeCase.client_approved_at !== null) {
      return { alreadyApproved: true, documents: [] };
    }

    const docs = await this.packageDocumentRepo.find({
      where: { dispute_case_id: disputeCase.id, status: PackageDocumentStatus.READY },
    });

    const propertyAddress = this.buildPropertyAddress(disputeCase.property);
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
          viewUrl: this.azureBlobService.getFileUrl(doc.blob_name, THREE_DAY_WINDOW_MINUTES),
        })),
    };
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
        action: CaseAuditAction.VG_RESPONSE_RECORDED,
        performed_by: assessorId,
        response_notes: dto.responseNotes ?? null,
      }),
    );

    return saved;
  }

  async findAdvisoryView(token: string): Promise<AnalysisReportResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { advisory_view_token: token },
      select: ['id', 'case_reference', 'analysis_report_blob_path', 'advisory_view_token_expires_at'],
    });

    if (!disputeCase) {
      throw new NotFoundException('Advisory view token is invalid or does not exist');
    }

    if (DisputeCasesService.isExpired(disputeCase.advisory_view_token_expires_at)) {
      throw new GoneException('Advisory view link has expired — please contact your adviser to request a new one');
    }

    if (!disputeCase.analysis_report_blob_path) {
      throw new NotFoundException('Analysis report is not yet available for this case');
    }

    return {
      id: disputeCase.id,
      case_reference: disputeCase.case_reference,
      analysis_report_url: this.azureBlobService.getFileUrl(disputeCase.analysis_report_blob_path, THREE_DAY_WINDOW_MINUTES),
    };
  }

  async findNoObjectionReportUrl(id: string): Promise<AnalysisReportResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id },
      select: ['id', 'case_reference', 'analysis_report_blob_path'],
    });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    if (!disputeCase.analysis_report_blob_path) {
      throw new NotFoundException(`Analysis report is not yet available for case #${id}`);
    }
    return {
      id: disputeCase.id,
      case_reference: disputeCase.case_reference,
      analysis_report_url: this.azureBlobService.getFileUrl(disputeCase.analysis_report_blob_path, THREE_DAY_WINDOW_MINUTES),
    };
  }

  private static resolveDeadlineWhere(
    dashboardFilter: string | undefined,
    startOfToday: Date,
    endOf7Days: Date,
  ): object {
    if (dashboardFilter === 'due_this_week') {
      return { statutory_deadline: Between(startOfToday, endOf7Days) };
    }
    if (dashboardFilter === 'overdue') {
      return { statutory_deadline: LessThan(startOfToday) };
    }
    return {};
  }

  private static getDueThisWeekWindow(): { startOfToday: Date; endOf7Days: Date } {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOf7Days = new Date(startOfToday);
    endOf7Days.setDate(endOf7Days.getDate() + 7);
    endOf7Days.setHours(23, 59, 59, 999);
    return { startOfToday, endOf7Days };
  }

  private static isExpired(expiresAt: Date | null | undefined): boolean {
    return !expiresAt || expiresAt < new Date();
  }

  private buildPropertyAddress(
    property: { address: string | null; suburb: string | null; state: string | null; postcode: string | null } | null,
  ): string {
    if (!property) return 'Address not available';
    return [property.address, property.suburb, property.state, property.postcode]
      .filter(Boolean)
      .join(', ');
  }

  private static formatAud(val: number): string {
    return `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private buildAdvisoryEmailPayload(
    disputeCase: DisputeCase,
    dto: CloseNoObjectionDto,
    vgAssessedValue: number,
    closedAtDate: Date,
    viewReportUrl: string,
  ): Parameters<AzureEmailService['sendAdvisoryLetterNotification']>[0] {
    return {
      clientEmail: disputeCase.client.email!, // guarded by ClientEmailMissingException before this is called
      clientName: disputeCase.client.name,
      caseReference: disputeCase.case_reference,
      propertyAddress: this.buildPropertyAddress(disputeCase.property),
      vgAssessedValue: DisputeCasesService.formatAud(vgAssessedValue),
      internalAssessedValue: DisputeCasesService.formatAud(dto.internalAssessmentValue),
      assessorFullName: disputeCase.assigned_accountant?.fullName ?? 'Your YML Adviser',
      closedAt: closedAtDate.toLocaleString('en-AU', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }),
      viewReportUrl,
    };
  }

  async submitToVg(id: string, dto: SubmitToVgDto, assessorId: string, assessorFullName: string): Promise<DisputeCaseResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const disputeCase = await queryRunner.manager.findOne(DisputeCase, {
        where: { id },
        relations: ['client', 'property', 'valuation_notice'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!disputeCase) {
        throw new NotFoundException(`Dispute case #${id} not found`);
      }

      if (disputeCase.status === DisputeStatus.SUBMITTED_TO_VG) {
        throw new CaseAlreadySubmittedException(id);
      }

      if (disputeCase.status !== DisputeStatus.CLIENT_APPROVED) {
        throw new CaseNotClientApprovedException(id);
      }

      const year = new Date().getFullYear();
      const caseIdPrefix = id.replace(/-/g, '').slice(0, 4).toUpperCase();
      const randomDigits = randomInt(1000, 10000).toString();
      const lodgmentRef = `LR-${year}-${caseIdPrefix}-${randomDigits}`;
      const submittedAt = new Date();

      disputeCase.status = DisputeStatus.SUBMITTED_TO_VG;
      disputeCase.submitted_at = submittedAt;
      disputeCase.lodgment_reference_number = lodgmentRef;
      if (dto?.submissionNotes) {
        disputeCase.notes = dto.submissionNotes;
      }

      await queryRunner.manager.save(DisputeCase, disputeCase);

      const auditEntry = queryRunner.manager.create(AuditLog, {
        action: AuditAction.SUBMITTED_TO_VG,
        performedBy: assessorId,
        caseId: id,
        lodgmentReferenceNumber: lodgmentRef,
      });
      await queryRunner.manager.save(AuditLog, auditEntry);

      const vgEmail = this.config.getOrThrow<string>('VG_SUBMISSION_EMAIL');
      await this.azureEmailService.sendVgSubmissionConfirmation({
        sendTo: vgEmail,
        clientName: disputeCase.client?.name ?? '',
        caseReference: disputeCase.case_reference,
        propertyAddress: this.buildPropertyAddress(disputeCase.property),
        lodgmentReferenceNumber: lodgmentRef,
        submittedAt: submittedAt.toLocaleString('en-AU', {
          timeZone: 'Australia/Melbourne',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        assessorFullName,
      });

      await queryRunner.commitTransaction();

      return disputeCase;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findCasesDueForVGFollowUp(): Promise<DisputeCase[]> {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    return this.disputeCasesRepository
      .createQueryBuilder('dc')
      .leftJoinAndSelect('dc.property', 'property')
      .leftJoinAndSelect('dc.valuation_notice', 'valuation_notice')
      .where('dc.status = :status', { status: DisputeStatus.SUBMITTED_TO_VG })
      .andWhere('COALESCE(dc.last_vg_follow_up_sent_at, dc.submitted_at) <= :threshold', { threshold: fiveDaysAgo })
      .andWhere('dc.vg_follow_up_count < :max', { max: MAX_VG_FOLLOW_UPS })
      .getMany();
  }

  async sendVGFollowUp(caseId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let resolvedCase: DisputeCase | null = null;
    let newFollowUpCount = 0;

    try {
      resolvedCase = await queryRunner.manager.findOne(DisputeCase, {
        where: { id: caseId },
        relations: ['property'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!resolvedCase) {
        throw new NotFoundException(`Dispute case #${caseId} not found`);
      }

      newFollowUpCount = resolvedCase.vg_follow_up_count + 1;
      const now = new Date();

      resolvedCase.vg_follow_up_count = newFollowUpCount;
      resolvedCase.last_vg_follow_up_sent_at = now;
      await queryRunner.manager.save(DisputeCase, resolvedCase);

      const auditEntry = queryRunner.manager.create(AuditLog, {
        action: AuditAction.VG_FOLLOW_UP_SENT,
        performedBy: SYSTEM_ACTOR_ID,
        caseId,
        lodgmentReferenceNumber: resolvedCase.lodgment_reference_number,
      });
      await queryRunner.manager.save(AuditLog, auditEntry);

      const vgEmail = this.config.getOrThrow<string>('VG_SUBMISSION_EMAIL');
      await this.azureEmailService.sendVgFollowUpEnquiry({
        sendTo: vgEmail,
        caseReference: resolvedCase.case_reference,
        propertyAddress: this.buildPropertyAddress(resolvedCase.property),
        lodgmentReferenceNumber: resolvedCase.lodgment_reference_number ?? '',
        submittedAt: (resolvedCase.submitted_at ?? now).toLocaleString('en-AU', {
          timeZone: 'Australia/Melbourne',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        followUpCount: String(newFollowUpCount),
      });

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    // Notification fires only after a successful commit; failure here is non-critical
    if (resolvedCase?.assigned_accountant_id) {
      await this.notificationsService.create(
        resolvedCase.assigned_accountant_id,
        NotificationType.VG_FOLLOW_UP_SENT,
        `Follow-up #${newFollowUpCount} sent to Valuer-General for case ${resolvedCase.case_reference} (${this.buildPropertyAddress(resolvedCase.property)}).`,
        caseId,
      );
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    const disputeCase = await this.disputeCasesRepository.findOne({ where: { id } });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    await this.disputeCasesRepository.remove(disputeCase);
    return { message: `Dispute case #${id} removed` };
  }

}
