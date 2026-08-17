import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  FindOptionsWhere,
  ILike,
  In,
  IsNull,
  LessThan,
  Not,
  Repository,
} from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { GetDisputeCasesQueryDto } from '../../common/dto/paginated-query.dto';
import { PaginatedDisputeCasesResponseDto } from '../../common/dto/paginated-response.dto';
import { UpdateDisputeCaseDto } from './dto/update-dispute-case.dto';
import { CreateDisputeIntakeDto } from './dto/create-dispute-intake.dto';
import { CreateDisputeIntakeV2Dto } from './dto/create-dispute-intake-v2.dto';
import { DisputeCaseResponseDto } from './dto/dispute-case-response.dto';
import { AnalysisReportResponseDto } from './dto/analysis-report-response.dto';
import {
  BulkDeleteDisputeCasesResponseDto,
  BulkDeleteDisputeCasesResultDto,
} from './dto/bulk-delete-cases.dto';
import {
  DisputeCase,
  DisputeStatus,
  OutcomeResult,
} from './entities/dispute-case.entity';
import { CaseAuditEntryDto } from './dto/case-audit-entry.dto';
import {
  AWAITING_VG_RESPONSE_STATUSES,
  DASHBOARD_INACTIVE_STATUSES,
  DISPUTE_STATUS_LABELS,
} from './dispute-status';
import {
  buildPropertyAddress,
  formatAuDateTime,
} from './dispute-case-format.util';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';
import { getLandTaxYearFromValuationDate } from '../../common/utils/land-tax-year.util';
import { LandTaxComputationService } from '../valuation/land-tax-computation.service';
import { LandTaxResponseDto } from '../valuation/dto/land-tax-response.dto';
import {
  CalculateTaxDto,
  OwnershipType,
} from '../valuation/dto/calculate-tax.dto';
import { DisputeIntakeOrchestrator } from './intake/dispute-intake.orchestrator';
import { DocumentExtractionHandler } from './intake/document-extraction.handler';
import { ValuationNoticeExtractionDto } from './dto/extract-valuation-notice.dto';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import {
  AuditAction,
  AuditLog,
  SYSTEM_ACTOR_ID,
  SYSTEM_ACTOR_ROLE,
} from '../audit-log/entities/audit-log.entity';

const MAX_VG_FOLLOW_UPS = 3;

const THREE_DAY_WINDOW_DAYS = 3;
const THREE_DAY_WINDOW_MINUTES = THREE_DAY_WINDOW_DAYS * 24 * 60;

/** Upper bound on GET /:id/audit. See findAuditTrail for why it is a cap and not pagination. */
const MAX_AUDIT_TRAIL_ENTRIES = 500;

@Injectable()
export class DisputeCasesService {
  private readonly logger = new Logger(DisputeCasesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly intakeOrchestrator: DisputeIntakeOrchestrator,
    private readonly documentExtractionHandler: DocumentExtractionHandler,
    private readonly azureEmailService: AzureEmailService,
    private readonly azureBlobService: AzureBlobService,
    private readonly config: ConfigService,
    private readonly notificationsService: NotificationsService,
    @InjectRepository(DisputeCase)
    private disputeCasesRepository: Repository<DisputeCase>,
    @InjectRepository(ValuationNotice)
    private readonly valuationNoticeRepo: Repository<ValuationNotice>,
    // Read-only here. Audit rows are WRITTEN by DisputeStatusTransitionService, inside the
    // transaction that moves the status; this service only serves them back.
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly taxComputationService: LandTaxComputationService,
  ) {}

  async submitIntakeApplication(
    intakeDto: CreateDisputeIntakeDto | CreateDisputeIntakeV2Dto,
  ): Promise<unknown> {
    // V2 omits grounds/constraints; orchestrator treats those as optional at runtime
    return this.intakeOrchestrator.submitIntakeApplication(
      intakeDto as CreateDisputeIntakeDto,
    );
  }

  async extractValuationNoticeDocument(
    attachment: string,
  ): Promise<ValuationNoticeExtractionDto> {
    return this.documentExtractionHandler.extractValuationNotice(attachment);
  }

  async findAll(clientId?: string): Promise<DisputeCaseResponseDto[]> {
    return await this.disputeCasesRepository.find({
      where: clientId ? { client_id: clientId } : {},
    });
  }

  async findPaginated(
    query: GetDisputeCasesQueryDto,
  ): Promise<PaginatedDisputeCasesResponseDto> {
    const {
      page,
      limit,
      search,
      status,
      jurisdiction,
      clientId,
      dashboardFilter,
    } = query;
    const skip = (page - 1) * limit;

    const { startOfToday, endOf7Days } =
      DisputeCasesService.getDueThisWeekWindow();

    const statusWhere = (() => {
      if (status) {
        return { status };
      }
      if (dashboardFilter) {
        // DASHBOARD_INACTIVE_STATUSES, not CLOSED_STATUSES: this branch serves the drill-through
        // from a dashboard counter, so it must exclude exactly what DashboardRepository excluded
        // when it produced the number. The two sets are equal today and documented to diverge —
        // vg_agreed is deliberately still active — at which point a tile would stop matching the
        // list it links to.
        return { status: Not(In(DASHBOARD_INACTIVE_STATUSES)) };
      }
      return {};
    })();

    const deadlineWhere = DisputeCasesService.resolveDeadlineWhere(
      dashboardFilter,
      startOfToday,
      endOf7Days,
    );

    const baseWhere: FindOptionsWhere<DisputeCase> = {
      ...(clientId && { client_id: clientId }),
      ...statusWhere,
      ...(jurisdiction && { jurisdiction }),
      ...deadlineWhere,
    };

    const where: FindOptionsWhere<DisputeCase>[] = search
      ? [
          { ...baseWhere, case_reference: ILike(`%${search}%`) },
          { ...baseWhere, client: { name: ILike(`%${search}%`) } },
          { ...baseWhere, property: { address: ILike(`%${search}%`) } },
          { ...baseWhere, property: { suburb: ILike(`%${search}%`) } },
        ]
      : [baseWhere];

    const [data, total] = await this.disputeCasesRepository.findAndCount({
      where,
      relations: { client: true, property: true },
      select: {
        id: true,
        case_reference: true,
        client_id: true,
        jurisdiction: true,
        status: true,
        statutory_deadline: true,
        original_assessed_value: true,
        internal_assessed_value: true,
        vg_follow_up_count: true,
        is_valuated: true,
        created_at: true,
        client: { name: true },
        property: { address: true, suburb: true, state: true, postcode: true },
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    const flattened = data.map((dc) => ({
      ...dc,
      client_name: dc.client?.name ?? null,
      property_address: buildPropertyAddress(dc.property),
    }));

    return {
      data: flattened,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id },
      relations: [
        'client',
        'property',
        'valuation_notice',
        'assigned_accountant',
        'assigned_lawyer',
        'legal_grounds',
        'dispute_constraints',
      ],
    });
    if (!disputeCase)
      throw new NotFoundException(`Dispute case #${id} not found`);
    return DisputeCasesService.withoutAdvisoryToken(disputeCase);
  }

  /**
   * Strips the advisory view token before a case leaves the API.
   *
   * advisory_view_token is a bearer credential: GET /dispute-cases/advisory-view is PUBLIC and
   * takes nothing but this value. DisputeCaseResponseDto never declared the field, but these
   * endpoints return the entity itself and TypeScript accepts it structurally, so the token was
   * being serialised to every caller who could read the case.
   *
   * Deleting the two keys rather than rebuilding through plainToInstance: the DTO carries no
   * @Expose decorators, so excludeExtraneousValues would empty the whole body, and a non-excluding
   * pass would also drop the relations this endpoint is expected to return.
   */
  private static withoutAdvisoryToken(
    disputeCase: DisputeCase,
  ): DisputeCaseResponseDto {
    const { advisory_view_token, advisory_view_token_expires_at, ...safe } =
      disputeCase;
    void advisory_view_token;
    void advisory_view_token_expires_at;
    return safe as DisputeCaseResponseDto;
  }

  /**
   * The case's history, oldest first.
   *
   * Reads the rows every transition already writes. Clients previously had to build a timeline
   * out of the `*_at` columns on the case, which cannot show `reports_uploaded`, `analysed` or
   * the recording of a VG response — none of those stamp a column. The audit trail does.
   *
   * Ascending because this feeds a timeline; a caller wanting "most recent first" can reverse
   * a short array more cheaply than it can re-sort a long one.
   */
  async findAuditTrail(id: string): Promise<CaseAuditEntryDto[]> {
    // 404 rather than an empty array: an unknown case and a case with no history are very
    // different answers, and only one of them means the client should stop asking.
    const exists = await this.disputeCasesRepository.exists({ where: { id } });
    if (!exists) throw new NotFoundException(`Dispute case #${id} not found`);

    const rows = await this.auditLogRepository.find({
      where: { caseId: id },
      order: { createdAt: 'ASC' },
      // Capped. A case accrues a row per lifecycle event plus one per VG follow-up and per
      // classified inbound email, so an old cycling case is unbounded in principle. Ascending, so
      // the cap drops the most recent rows — if a case ever hits it, this needs pagination rather
      // than a bigger number.
      take: MAX_AUDIT_TRAIL_ENTRIES,
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      from_status: row.fromStatus,
      to_status: row.toStatus,
      // from_status/to_status are stored as free text so old rows survive vocabulary changes,
      // which means a historical value may no longer be a DisputeStatus. Resolve what we can
      // and leave the rest null rather than echoing a stale enum as if it were a label.
      to_status_label: row.toStatus
        ? (DISPUTE_STATUS_LABELS[row.toStatus as DisputeStatus] ?? null)
        : null,
      notes: row.notes,
      performed_by_role: row.performedByRole,
      lodgment_reference_number: row.lodgmentReferenceNumber,
      created_at: row.createdAt,
    }));
  }

  async update(
    id: string,
    updateDisputeCaseDto: UpdateDisputeCaseDto,
  ): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id },
    });
    if (!disputeCase)
      throw new NotFoundException(`Dispute case #${id} not found`);
    Object.assign(disputeCase, updateDisputeCaseDto);
    const saved = await this.disputeCasesRepository.save(disputeCase);
    return DisputeCasesService.withoutAdvisoryToken(saved);
  }

  async findAdvisoryView(token: string): Promise<AnalysisReportResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { advisory_view_token: token },
      select: [
        'id',
        'case_reference',
        'analysis_report_blob_path',
        'advisory_view_token_expires_at',
      ],
    });

    if (!disputeCase) {
      throw new NotFoundException(
        'Advisory view token is invalid or does not exist',
      );
    }

    if (
      DisputeCasesService.isExpired(disputeCase.advisory_view_token_expires_at)
    ) {
      throw new GoneException(
        'Advisory view link has expired — please contact your adviser to request a new one',
      );
    }

    if (!disputeCase.analysis_report_blob_path) {
      throw new NotFoundException(
        'Analysis report is not yet available for this case',
      );
    }

    return {
      id: disputeCase.id,
      case_reference: disputeCase.case_reference,
      analysis_report_url: this.azureBlobService.getFileUrl(
        disputeCase.analysis_report_blob_path,
        THREE_DAY_WINDOW_MINUTES,
      ),
    };
  }

  async findNoObjectionReportUrl(
    id: string,
  ): Promise<AnalysisReportResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id },
      select: ['id', 'case_reference', 'analysis_report_blob_path'],
    });
    if (!disputeCase)
      throw new NotFoundException(`Dispute case #${id} not found`);
    if (!disputeCase.analysis_report_blob_path) {
      throw new NotFoundException(
        `Analysis report is not yet available for case #${id}`,
      );
    }
    return {
      id: disputeCase.id,
      case_reference: disputeCase.case_reference,
      analysis_report_url: this.azureBlobService.getFileUrl(
        disputeCase.analysis_report_blob_path,
        THREE_DAY_WINDOW_MINUTES,
      ),
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

  private static getDueThisWeekWindow(): {
    startOfToday: Date;
    endOf7Days: Date;
  } {
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

  async getPropertyAddressForCase(id: string): Promise<string> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id },
      relations: ['property'],
    });
    if (!disputeCase)
      throw new NotFoundException(`Dispute case #${id} not found`);
    return buildPropertyAddress(disputeCase.property);
  }

  async getCaseReferenceMap(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const rows = await this.disputeCasesRepository.find({
      where: { id: In(ids) },
      select: { id: true, case_reference: true },
    });
    return Object.fromEntries(rows.map((r) => [r.id, r.case_reference]));
  }

  async markValuated(id: string): Promise<void> {
    await this.disputeCasesRepository.update(id, { is_valuated: true });
  }

  async findCasesDueForVGFollowUp(): Promise<DisputeCase[]> {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    return (
      this.disputeCasesRepository
        .createQueryBuilder('dc')
        .leftJoinAndSelect('dc.property', 'property')
        .leftJoinAndSelect('dc.valuation_notice', 'valuation_notice')
        .where('dc.status IN (:...statuses)', {
          statuses: AWAITING_VG_RESPONSE_STATUSES,
        })
        // resubmitted_at is checked before submitted_at so a further submission restarts the
        // follow-up clock instead of firing immediately off the original lodgement date.
        .andWhere(
          'COALESCE(dc.last_vg_follow_up_sent_at, dc.resubmitted_at, dc.submitted_at) <= :threshold',
          { threshold: fiveDaysAgo },
        )
        .andWhere('dc.vg_follow_up_count < :max', { max: MAX_VG_FOLLOW_UPS })
        .getMany()
    );
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

      const vgEmail = this.config.getOrThrow<string>('VG_SUBMISSION_EMAIL');
      await this.azureEmailService.sendVgFollowUpEnquiry({
        sendTo: vgEmail,
        caseReference: resolvedCase.case_reference,
        propertyAddress: buildPropertyAddress(resolvedCase.property),
        lodgmentReferenceNumber: resolvedCase.lodgment_reference_number ?? '',
        submittedAt: formatAuDateTime(
          resolvedCase.submitted_at ?? now,
          'Australia/Melbourne',
        ),
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
        `Follow-up #${newFollowUpCount} sent to Valuer-General for case ${resolvedCase.case_reference} (${buildPropertyAddress(resolvedCase.property)}).`,
        caseId,
      );
    }
  }

  /**
   * Records what the inbound-email classifier made of a VG reply, WITHOUT changing the case
   * status. Recording a VG response is a manual decision (PATCH /v1/dispute-cases/:id/status), so
   * an AI reading of a letter can never advance a case on its own — it can only tell a human that
   * a reply arrived and what it appears to say.
   *
   * It writes NOTHING to the case — not even `outcome`. That column feeds the tax-savings
   * calculation and the client letter, so an unreviewed LLM verdict must not land in it: a
   * misread letter would otherwise silently restate a case's financial result, with the
   * classifier's own `confidence` captured but never gating anything. The verdict lives on the
   * audit row below, where it is plainly attributed to the system, and the assessor commits it to
   * the case by moving the status through `vg_agreed` or `case_closed`.
   */
  async recordVgEmailClassification(
    caseId: string,
    verdict: string,
    impliedOutcome: OutcomeResult | null,
    reasoning: string,
    confidence: number,
  ): Promise<void> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id: caseId },
    });
    if (!disputeCase) {
      throw new NotFoundException(`Dispute case #${caseId} not found`);
    }

    const auditRepo = this.dataSource.getRepository(AuditLog);
    await auditRepo.save(
      auditRepo.create({
        action: AuditAction.VG_EMAIL_CLASSIFIED,
        performedBy: SYSTEM_ACTOR_ID,
        performedByRole: SYSTEM_ACTOR_ROLE,
        caseId,
        lodgmentReferenceNumber: disputeCase.lodgment_reference_number,
        // No toStatus: this deliberately does not move the case. The implied outcome is stated in
        // the note rather than written to dispute_cases.outcome, so a machine's guess is always
        // legible as one and never mistaken for the assessor's own record of the result.
        notes:
          `Inbound VG email classified as "${verdict}" (confidence ${confidence.toFixed(2)})` +
          `${impliedOutcome ? `, implying outcome "${impliedOutcome}"` : ''}: ${reasoning}`,
      }),
    );

    if (disputeCase.assigned_accountant_id) {
      await this.notificationsService.create(
        disputeCase.assigned_accountant_id,
        NotificationType.VG_RESPONSE_RECEIVED,
        `A VG email arrived for case ${disputeCase.case_reference} and reads as "${verdict}". ` +
          `Review it and record the response on the case.`,
        caseId,
      );
    }
  }

  async remove(id: string, deletedById: string): Promise<{ message: string }> {
    const exists = await this.disputeCasesRepository.findOne({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Dispute case #${id} not found`);

    const result = await this.disputeCasesRepository.update(
      { id, deleted_at: IsNull() },
      { deleted_at: new Date(), deleted_by: deletedById },
    );

    if (!result.affected) {
      throw new ConflictException(`Dispute case #${id} is already deleted`);
    }

    return { message: `Dispute case #${id} has been deleted` };
  }

  async removeMany(
    caseIds: string[],
    deletedById: string,
  ): Promise<BulkDeleteDisputeCasesResponseDto> {
    const settled = await Promise.allSettled(
      caseIds.map((id) => this.remove(id, deletedById)),
    );

    const results: BulkDeleteDisputeCasesResultDto[] = settled.map(
      (outcome, i) => {
        const id = caseIds[i];
        if (outcome.status === 'fulfilled') {
          return { id, status: 'deleted' };
        }
        const err = outcome.reason;
        if (err instanceof NotFoundException) {
          return { id, status: 'not_found' };
        }
        if (err instanceof ConflictException) {
          return { id, status: 'already_deleted' };
        }
        this.logger.error(
          `[BulkDelete] Failed to delete dispute case #${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return { id, status: 'error' };
      },
    );

    const deleted = results.filter((r) => r.status === 'deleted').length;

    return {
      results,
      total: results.length,
      deleted,
      skipped: results.length - deleted,
    };
  }

  async calculateTax(id: string): Promise<LandTaxResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id },
      relations: ['valuation_notice'],
    });
    if (!disputeCase)
      throw new NotFoundException(`Dispute case #${id} not found`);

    const notice = disputeCase.valuation_notice;
    if (!notice)
      throw new BadRequestException(
        'Dispute case has no associated valuation notice.',
      );
    if (!notice.valuation_date)
      throw new BadRequestException(
        'Valuation notice is missing valuation_date.',
      );
    if (notice.appraised_value == null) {
      throw new BadRequestException(
        'Valuation notice has no appraised_value. Complete the appraisal before calculating tax.',
      );
    }

    const dto = this.buildCalculateTaxDto(
      notice,
      disputeCase.yml_fee_share_pct,
    );

    // Aggregate other non-exempt notices for the same client
    const otherNotices = await this.valuationNoticeRepo
      .createQueryBuilder('vn')
      .innerJoin('vn.dispute_cases', 'dc')
      .where('dc.client_id = :clientId', { clientId: disputeCase.client_id })
      .andWhere('dc.id != :caseId', { caseId: id })
      .andWhere('vn.is_exempt = false')
      .andWhere('vn.assessed_land_value IS NOT NULL')
      .getMany();

    if (otherNotices.length > 0) {
      dto.additional_land_values = otherNotices.map(
        (n) => n.assessed_land_value as number,
      );
    }

    const result = await this.taxComputationService.computeLandTax(dto);

    await this.disputeCasesRepository.update(id, {
      tax_saving: result.tax_saved,
      yml_revenue: result.yml_revenue,
      client_savings: result.client_savings,
    });

    return result;
  }

  private buildCalculateTaxDto(
    notice: ValuationNotice,
    feeSharePct: number,
  ): CalculateTaxDto {
    const taxYear = getLandTaxYearFromValuationDate(notice.valuation_date);

    const dto: CalculateTaxDto = {
      tax_year: taxYear,
      disputed_land_value: notice.appraised_value as number,
      ownership_type: notice.ownership_type ?? OwnershipType.INDIVIDUAL,
      is_foreign: notice.is_foreign ?? false,
      yml_fee_share_pct: feeSharePct ?? undefined,
    };

    if (
      notice.assessed_land_value != null &&
      notice.prior_land_value != null &&
      notice.land_value_2yr_prior != null
    ) {
      dto.vg_year_values = [
        notice.assessed_land_value,
        notice.prior_land_value,
        notice.land_value_2yr_prior,
      ];
    } else if (notice.assessed_land_value != null) {
      dto.vg_assessed_value = notice.assessed_land_value;
    } else {
      throw new BadRequestException(
        'Valuation notice must have at least assessed_land_value to compute VG tax.',
      );
    }

    return dto;
  }
}
