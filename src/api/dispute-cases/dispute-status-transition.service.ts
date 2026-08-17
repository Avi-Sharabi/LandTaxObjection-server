import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { randomInt, randomUUID } from 'crypto';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';
import {
  AuditAction,
  AuditLog,
  SYSTEM_ACTOR_ID,
  SYSTEM_ACTOR_ROLE,
} from '../audit-log/entities/audit-log.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { UserRole } from '../users/entities/user.entity';
import {
  DisputeCase,
  DisputeStatus,
  OutcomeResult,
} from './entities/dispute-case.entity';
import {
  AWAITING_VG_RESPONSE_STATUSES,
  DISPUTE_STATUS_LABELS,
  MARK_ANALYSED_SOURCE_STATUSES,
  canTransition,
  isAtOrAfterLodgement,
  isManualTarget,
  manualTransitionsFrom,
  statusesImpliedBy,
  toStatusOptions,
} from './dispute-status';
import { ASSESSMENT_DOCUMENT_TYPE_LABELS } from '../assessment-documents/entities/assessment-document.entity';
import { AssessmentDocumentsRepository } from '../assessment-documents/assessment-documents.repository';
import {
  CaseClosurePayloadDto,
  UpdateDisputeCaseStatusDto,
  VgResponsePayloadDto,
} from './dto/update-dispute-case-status.dto';
import {
  DisputeCaseStatusTransitionResponseDto,
  DisputeCaseTransitionsResponseDto,
  SystemTransitionBlockerCode,
  SystemTransitionBlockerDto,
} from './dto/dispute-case-status-transition-response.dto';
import { IllegalStatusTransitionException } from './exceptions/illegal-status-transition.exception';
import { StatusTransitionForbiddenException } from './exceptions/status-transition-forbidden.exception';
import { CaseAlreadySubmittedException } from './exceptions/case-already-submitted.exception';
import { FurtherSubmissionLimitReachedException } from './exceptions/further-submission-limit-reached.exception';
import { ClientEmailMissingException } from './exceptions/client-email-missing.exception';
import { MINIMUM_COMPARABLES } from '../comparables/entities/comparable-sale.entity';
import {
  buildPropertyAddress,
  formatAud,
  formatAuDateTime,
} from './dispute-case-format.util';

const MAX_FURTHER_SUBMISSIONS = 3;
const ADVISORY_TOKEN_VALID_HOURS = 72;

/**
 * One timezone for every date this service renders. The VG email and the client email previously
 * hardcoded Australia/Melbourne and Australia/Sydney respectively — an artefact of the two
 * separate endpoints they came from, not a decision. Both audiences are NSW.
 */
const CORRESPONDENCE_TIME_ZONE = 'Australia/Sydney';

/** Signature fallback when a case has no assigned accountant. */
const DEFAULT_ADVISER_NAME = 'Your YML Adviser';

/** Rendered in correspondence for a value that is genuinely not on file. */
const NOT_RECORDED = 'N/A';

/**
 * How a comparable sale is counted, in one place.
 *
 * `%CASE_ID%` is substituted with the caller's bind parameter or correlated column — never with a
 * value. The guard in markAnalysed, the blocker on listTransitions and the skip explanation all
 * build on this: three hand-written COUNT(*)s would let the rule and the reason for the rule
 * diverge the moment a soft-delete or exclusion flag is added to the table.
 */
const COMPARABLE_SALES_COUNT = `
  SELECT COUNT(*) FROM comparable_sales cs WHERE cs.dispute_case_id = %CASE_ID%`;

type PayloadKey = 'closure' | 'vgResponse';

/**
 * Which optional payload object each target accepts. Anything else supplied is a 400, so a closure
 * payload cannot be smuggled into an outcome transition. This is the discriminated union expressed
 * as data — a real union would fight the global forbidNonWhitelisted validation pipe.
 */
const TRANSITION_PAYLOAD: Record<DisputeStatus, readonly PayloadKey[]> = {
  [DisputeStatus.CREATED]: [],
  [DisputeStatus.TNC_AGREED]: [],
  [DisputeStatus.REPORTS_UPLOADED]: [],
  [DisputeStatus.ANALYSED]: [],
  [DisputeStatus.OBJECTION_SUBMITTED]: [],
  // NOT 'vgResponse': the payload's only field is finalAgreedValue, which belongs to vg_agreed.
  // Accepting it here meant a caller who sent it got a 200 and silent discard.
  [DisputeStatus.VG_RESPONSE_RECEIVED]: [],
  [DisputeStatus.AI_FURTHER_SUBMISSION]: [],
  [DisputeStatus.VG_AGREED]: ['vgResponse'],
  [DisputeStatus.CASE_CLOSED]: ['closure'],
};

const TRANSITION_AUDIT_ACTION: Record<DisputeStatus, AuditAction> = {
  [DisputeStatus.CREATED]: AuditAction.STATUS_FORCED, // never written through here
  [DisputeStatus.TNC_AGREED]: AuditAction.TNC_AGREED,
  [DisputeStatus.REPORTS_UPLOADED]: AuditAction.REPORTS_UPLOADED,
  [DisputeStatus.ANALYSED]: AuditAction.ANALYSED,
  [DisputeStatus.OBJECTION_SUBMITTED]: AuditAction.SUBMITTED_TO_VG,
  [DisputeStatus.VG_RESPONSE_RECEIVED]: AuditAction.VG_RESPONSE_RECORDED,
  [DisputeStatus.AI_FURTHER_SUBMISSION]: AuditAction.FURTHER_SUBMISSION_SENT,
  [DisputeStatus.VG_AGREED]: AuditAction.VG_OUTCOME_RECORDED,
  [DisputeStatus.CASE_CLOSED]: AuditAction.CASE_CLOSED,
};

interface Actor {
  id: string;
  fullName: string;
  role: UserRole;
}

/** Deferred until after commit — the state change is true whether or not the mail server accepts. */
type PostCommitEffect = () => Promise<unknown>;

interface HandlerContext {
  manager: EntityManager;
  disputeCase: DisputeCase;
  from: DisputeStatus;
  actor: Actor;
  closure?: CaseClosurePayloadDto;
  vgResponse?: VgResponsePayloadDto;
  now: Date;
  postCommit: PostCommitEffect[];
}

/**
 * The chokepoint for every MANUAL dispute-case transition, plus the system `analysed` write.
 * The other two system-written statuses are set elsewhere: `created` by the intake orchestrator and
 * `reports_uploaded` by AssessmentDocumentsRepository, both as guarded single UPDATEs.
 *
 * It replaces three endpoints that each hand-rolled their own guard (submit-to-vg,
 * close-no-objection, advance-to-appraisal). Legality comes from DISPUTE_STATUS_TRANSITIONS;
 * this service owns the side effects each transition carries.
 *
 * Two rules that must not be relaxed:
 *  1. The locked read takes NO relations. PostgreSQL rejects FOR UPDATE on the nullable side of an
 *     outer join, so relations are loaded by a separate unlocked read.
 *  2. VG-bound lodgement email is awaited INSIDE the transaction — sending it is the act of
 *     lodging, so a failure must roll the status back. Client-facing mail goes after commit, where
 *     a bounce cannot undo a true state change.
 */
@Injectable()
export class DisputeStatusTransitionService {
  private readonly logger = new Logger(DisputeStatusTransitionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly azureEmailService: AzureEmailService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
    private readonly assessmentDocumentsRepository: AssessmentDocumentsRepository,
  ) {}

  // ─── Public entry points ────────────────────────────────────────────────────────────────

  /**
   * Legal next moves for the case, for the client's action menu, plus why the next SYSTEM-written
   * status has not happened.
   *
   * The blockers matter because `reports_uploaded` and `analysed` are system targets: a case
   * waiting on either shows an empty `allowed` list, which is indistinguishable from a terminal
   * case unless the reason is stated. Before the transition table existed, the retired
   * advance-to-appraisal endpoint returned that reason as a 422.
   */
  async listTransitions(
    id: string,
  ): Promise<DisputeCaseTransitionsResponseDto> {
    const disputeCase = await this.dataSource
      .getRepository(DisputeCase)
      .findOne({ where: { id }, select: { id: true, status: true } });
    if (!disputeCase)
      throw new NotFoundException(`Dispute case #${id} not found`);

    const current = disputeCase.status;
    return {
      current,
      currentLabel: DISPUTE_STATUS_LABELS[current],
      allowed: toStatusOptions(manualTransitionsFrom(current)),
      blockers: await this.findSystemBlockers(id, current),
      // Derived from the same graph as `allowed`, so a client can tick a completed timeline step
      // without keeping its own copy of the lifecycle to reason about progress.
      impliedStatuses: [...statusesImpliedBy(current)],
    };
  }

  /**
   * Diagnostics for the two system-written statuses, computed from the same predicates the writers
   * use: REPORTS_UPLOADED_REQUIRED_TYPES for the document gate in AssessmentDocumentsRepository,
   * and MINIMUM_COMPARABLES for markAnalysed below.
   *
   * Returns empty rather than throwing on any failure — this is advisory information hanging off a
   * read endpoint, so it must never be the reason a client cannot see a case's available actions.
   */
  private async findSystemBlockers(
    caseId: string,
    status: DisputeStatus,
  ): Promise<SystemTransitionBlockerDto[]> {
    // Past the pre-analysis stretch of the lifecycle there is no system transition left to block.
    if (!MARK_ANALYSED_SOURCE_STATUSES.includes(status)) return [];

    try {
      const blockers: SystemTransitionBlockerDto[] = [];

      // Only tnc_agreed can be promoted by the document gate; from `created` the case has not
      // agreed terms yet, and reports_uploaded has already cleared it.
      if (status === DisputeStatus.TNC_AGREED) {
        const missingTypes =
          await this.assessmentDocumentsRepository.findMissingRequiredReportTypes(
            caseId,
          );
        for (const type of missingTypes) {
          blockers.push({
            code: SystemTransitionBlockerCode.MISSING_DOCUMENT_TYPE,
            blockedStatus: DisputeStatus.REPORTS_UPLOADED,
            message:
              `No ${ASSESSMENT_DOCUMENT_TYPE_LABELS[type].toLowerCase()} has been uploaded for ` +
              `this case. Upload one, or set the document type on a file already on file.`,
          });
        }
      }

      const comparables = await this.countComparableSales(caseId);
      if (comparables < MINIMUM_COMPARABLES) {
        blockers.push({
          code: SystemTransitionBlockerCode.INSUFFICIENT_COMPARABLES,
          blockedStatus: DisputeStatus.ANALYSED,
          message:
            `Only ${comparables} of the ${MINIMUM_COMPARABLES} required comparable sales are on ` +
            `file, so the analysis cannot complete.`,
        });
      }

      return blockers;
    } catch (error) {
      this.logger.warn(
        `[STATUS] could not compute transition blockers for case ${caseId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private async countComparableSales(caseId: string): Promise<number> {
    const rows: unknown = await this.dataSource.query(
      `SELECT (${COMPARABLE_SALES_COUNT.replace('%CASE_ID%', '$1')})::int AS count`,
      [caseId],
    );
    const row = Array.isArray(rows)
      ? (rows[0] as { count: number } | undefined)
      : undefined;
    return Number(row?.count ?? 0);
  }

  // ─── The transition ─────────────────────────────────────────────────────────────────────

  async applyManual(
    id: string,
    dto: UpdateDisputeCaseStatusDto,
    actor: Actor,
  ): Promise<DisputeCaseStatusTransitionResponseDto> {
    if (dto.force) {
      if (actor.role !== UserRole.ADMIN) {
        throw new StatusTransitionForbiddenException(dto.status, actor.role, [
          UserRole.ADMIN,
        ]);
      }
      if (!dto.notes?.trim()) {
        throw new BadRequestException(
          'Notes are required when forcing a status change.',
        );
      }
    }

    const target = dto.status;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const postCommit: PostCommitEffect[] = [];
    let from: DisputeStatus;
    let saved: DisputeCase;

    try {
      // Lock the row ONLY — no relations. See the class comment.
      const disputeCase = await queryRunner.manager.findOne(DisputeCase, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!disputeCase)
        throw new NotFoundException(`Dispute case #${id} not found`);

      from = disputeCase.status;

      // Idempotent no-op. Handled before the table is consulted so a double-click can never
      // re-run a side effect; concurrent duplicates serialise on the lock and the second lands here.
      if (from === target) {
        await queryRunner.commitTransaction();
        return this.toResponse(disputeCase, from, false);
      }

      if (dto.force) {
        disputeCase.status = target;
        saved = await queryRunner.manager.save(DisputeCase, disputeCase);
        await this.writeAudit(queryRunner.manager, {
          action: AuditAction.STATUS_FORCED,
          disputeCase: saved,
          from,
          to: target,
          actorId: actor.id,
          actorRole: actor.role,
          notes: dto.notes ?? null,
        });
        await queryRunner.commitTransaction();
        this.logger.warn(
          `[STATUS] FORCED ${id}: ${from} -> ${target} by ${actor.id} (${actor.role}) — ${dto.notes}`,
        );
        this.warnIfForcedStateIsInconsistent(saved);
        return this.toResponse(saved, from, true);
      }

      this.assertManualMoveAllowed(id, from, target, dto);

      const ctx: HandlerContext = {
        manager: queryRunner.manager,
        disputeCase,
        from,
        actor,
        closure: dto.closure,
        vgResponse: dto.vgResponse,
        now: new Date(),
        postCommit,
      };

      disputeCase.status = target;
      await this.runHandler(target, ctx);

      saved = await queryRunner.manager.save(DisputeCase, disputeCase);
      await this.writeAudit(queryRunner.manager, {
        action: TRANSITION_AUDIT_ACTION[target],
        disputeCase: saved,
        from,
        to: target,
        actorId: actor.id,
        actorRole: actor.role,
        notes: dto.notes ?? null,
      });

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    for (const effect of postCommit) {
      await effect().catch((err: unknown) =>
        this.logger.error(
          `[STATUS] post-commit effect failed for case ${id} (${from} -> ${target}): ${String(err)}`,
        ),
      );
    }

    return this.toResponse(saved, from, true);
  }

  /**
   * A forced move runs NO handlers, so it can leave a case in a state no legal path produces.
   * The costly one is a lodged status with no `submitted_at`: the VG follow-up cron will never
   * chase it, and every manual way forward (onVgResponseReceived, onAiFurtherSubmission,
   * onVgAgreed) rejects a case with a null `submitted_at`, so the case is stranded silently.
   *
   * Deliberately a log rather than a throw or a repair — force exists precisely so an admin can
   * put a case somewhere the rules forbid, and repairing the state here would make the override
   * unpredictable. Logged at `error` so it surfaces in alerting rather than dying in a debug feed.
   */
  private warnIfForcedStateIsInconsistent(disputeCase: DisputeCase): void {
    if (
      AWAITING_VG_RESPONSE_STATUSES.includes(disputeCase.status) &&
      disputeCase.submitted_at === null
    ) {
      this.logger.error(
        `[STATUS] case ${disputeCase.id} (${disputeCase.case_reference}) was FORCED to ` +
          `'${disputeCase.status}' with submitted_at still null. The VG follow-up cron will not ` +
          'chase it and no manual transition can move it on. Set submitted_at, or force it back.',
      );
    }
  }

  private assertManualMoveAllowed(
    id: string,
    from: DisputeStatus,
    target: DisputeStatus,
    dto: UpdateDisputeCaseStatusDto,
  ): void {
    // THE gate on system-written targets, not defence in depth. The DTO accepts every
    // DisputeStatus so that an admin `force` can reach created / reports_uploaded / analysed —
    // without that, a case the AI could not find MINIMUM_COMPARABLES for was stuck below
    // `analysed` with no route past it, for any actor. This check runs only on the non-force
    // path, which is exactly where the restriction belongs.
    if (!isManualTarget(target)) {
      throw new BadRequestException(
        `Status '${target}' is set by the system, not by a status change request. ` +
          'An admin can override with force:true and a reason.',
      );
    }

    if (!canTransition(from, target)) {
      // manualTransitionsFrom, not allowedTransitionsFrom: the raw graph includes system-written
      // targets, so the message would advertise a status this same endpoint then rejects with 400.
      throw new IllegalStatusTransitionException(
        id,
        from,
        target,
        manualTransitionsFrom(from),
      );
    }

    const permitted = TRANSITION_PAYLOAD[target];
    const supplied: PayloadKey[] = [];
    if (dto.closure) supplied.push('closure');
    if (dto.vgResponse) supplied.push('vgResponse');
    const stray = supplied.filter((key) => !permitted.includes(key));
    if (stray.length) {
      throw new BadRequestException(
        `Payload '${stray.join("', '")}' is not accepted when moving to '${target}'. ` +
          `Accepted: ${permitted.join(', ') || 'none'}.`,
      );
    }
  }

  private async runHandler(
    target: DisputeStatus,
    ctx: HandlerContext,
  ): Promise<void> {
    switch (target) {
      case DisputeStatus.TNC_AGREED:
        return this.onTncAgreed(ctx);
      case DisputeStatus.OBJECTION_SUBMITTED:
        return this.onObjectionSubmitted(ctx);
      case DisputeStatus.VG_RESPONSE_RECEIVED:
        return this.onVgResponseReceived(ctx);
      case DisputeStatus.AI_FURTHER_SUBMISSION:
        return this.onAiFurtherSubmission(ctx);
      case DisputeStatus.VG_AGREED:
        return this.onVgAgreed(ctx);
      case DisputeStatus.CASE_CLOSED:
        return this.onCaseClosed(ctx);
      default:
        // created / reports_uploaded / analysed never reach a manual handler.
        return;
    }
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────────────────

  private async onTncAgreed(ctx: HandlerContext): Promise<void> {
    // Mirror the client-level acceptance date only if it is not already set — never overwrite a
    // real signature date with the date someone clicked the button.
    await ctx.manager.query(
      `UPDATE clients SET tc_accepted_at = $2 WHERE id = $1 AND tc_accepted_at IS NULL`,
      [ctx.disputeCase.client_id, ctx.now],
    );
  }

  private async onObjectionSubmitted(ctx: HandlerContext): Promise<void> {
    const { disputeCase } = ctx;

    if (disputeCase.submitted_at !== null) {
      throw new CaseAlreadySubmittedException(disputeCase.id);
    }
    // submitted_at is the ONLY precondition — the accountant lodges on their own authority. Any
    // consent gate added later has to live HERE: the VG email goes out inside this transaction,
    // so there is no later checkpoint at which consent could still be verified.

    disputeCase.submitted_at = ctx.now;
    if (!disputeCase.lodgment_reference_number) {
      disputeCase.lodgment_reference_number = this.mintLodgementReference(
        disputeCase.id,
      );
    }
    // Re-arm the follow-up schedule. Mandatory for any AWAITING_VG_RESPONSE_STATUSES member —
    // see the invariant documented on that constant in dispute-status.ts.
    disputeCase.vg_follow_up_count = 0;
    disputeCase.last_vg_follow_up_sent_at = null;

    await this.sendVgLodgementEmail(
      ctx,
      disputeCase.lodgment_reference_number,
      ctx.now,
    );
  }

  // Async with nothing to await today, deliberately: runHandler dispatches every handler through
  // one Promise<void> signature, and adding a DB write here later must not be a signature change.
  // eslint-disable-next-line @typescript-eslint/require-await
  private async onVgResponseReceived(ctx: HandlerContext): Promise<void> {
    const { disputeCase } = ctx;
    if (disputeCase.submitted_at === null) {
      throw new ConflictException(
        `Dispute case #${disputeCase.id} has not been lodged, so no VG response can be recorded.`,
      );
    }
    // What the response SAID goes on this transition's audit row, from dto.notes — a cycling case
    // passes through here repeatedly, so the note has to belong to one crossing, not to the case.
    this.queueAccountantNotification(
      ctx,
      `VG response recorded for case ${disputeCase.case_reference}.`,
    );
  }

  private async onAiFurtherSubmission(ctx: HandlerContext): Promise<void> {
    const { disputeCase } = ctx;
    if (disputeCase.submitted_at === null) {
      throw new ConflictException(
        `Dispute case #${disputeCase.id} has not been lodged, so no further submission is possible.`,
      );
    }
    if (disputeCase.resubmission_count >= MAX_FURTHER_SUBMISSIONS) {
      throw new FurtherSubmissionLimitReachedException(
        disputeCase.id,
        MAX_FURTHER_SUBMISSIONS,
      );
    }

    disputeCase.resubmitted_at = ctx.now;
    disputeCase.resubmission_count += 1;
    disputeCase.vg_follow_up_count = 0;
    disputeCase.last_vg_follow_up_sent_at = null;
    // The previous round's result no longer applies — neither the classification nor the figure
    // that came with it. Leaving final_agreed_value behind would let a superseded number reach
    // the tax-savings calculation and the client letter.
    disputeCase.outcome = null;
    disputeCase.final_agreed_value = null;

    // submitted_at and lodgment_reference_number are deliberately untouched: the original
    // reference is the VG's handle on the thread and the original date is what the report cites.
    await this.sendVgLodgementEmail(
      ctx,
      disputeCase.lodgment_reference_number ?? NOT_RECORDED,
      ctx.now,
    );
  }

  // See onVgResponseReceived — same uniform-signature reason.
  // eslint-disable-next-line @typescript-eslint/require-await
  private async onVgAgreed(ctx: HandlerContext): Promise<void> {
    const { disputeCase } = ctx;
    if (disputeCase.submitted_at === null) {
      throw new ConflictException(
        `Dispute case #${disputeCase.id} has not been lodged, so no VG outcome can be recorded.`,
      );
    }

    disputeCase.outcome = OutcomeResult.UPHELD;
    if (ctx.vgResponse?.finalAgreedValue !== undefined) {
      disputeCase.final_agreed_value = ctx.vgResponse.finalAgreedValue;
    }
    // Notes for this agreement land on its audit row from dto.notes — see writeAudit.

    this.queueAccountantNotification(
      ctx,
      `VG agreed the objection for case ${disputeCase.case_reference}.`,
    );
    this.queueVgOutcomeClientEmail(ctx, OutcomeResult.UPHELD);
  }

  private async onCaseClosed(ctx: HandlerContext): Promise<void> {
    const { disputeCase, closure } = ctx;

    disputeCase.closed_at = ctx.now;
    if (closure?.outcome !== undefined) disputeCase.outcome = closure.outcome;
    // Only write notes when supplied — an unconditional write would null existing notes.
    if (closure?.assessorNotes !== undefined)
      disputeCase.notes = closure.assessorNotes;

    if (isAtOrAfterLodgement(ctx.from)) {
      if (closure?.outcome) {
        this.queueVgOutcomeClientEmail(ctx, closure.outcome);
      }
      return;
    }

    // Pre-lodgement. The advisory letter is OPT-IN: supplying an internal assessment value is the
    // assessor asserting "I valued this and the VG's figure stands", which is the whole content of
    // the letter. Without it this is a plain close — a withdrawal, a lapsed deadline — which
    // records the facts and emails nobody. Inferring the advisory path from lodgement state alone
    // made those closes unrepresentable, even though the transition graph explicitly allows
    // created -> case_closed for exactly them.
    if (closure?.internalAssessmentValue === undefined) return;

    await this.applyAdvisoryClose(ctx, closure.internalAssessmentValue);
  }

  /**
   * The absorbed closeNoObjection: a pre-lodgement close where the assessor has concluded the VG
   * value is defensible. Ported field by field from the retired endpoint.
   */
  private async applyAdvisoryClose(
    ctx: HandlerContext,
    internalAssessmentValue: number,
  ): Promise<void> {
    const { disputeCase } = ctx;

    const context = await this.loadCaseContext(ctx.manager, disputeCase.id);
    // Not `?? 0`: a missing notice used to make the viable-grounds comparison below vacuously
    // pass, so the one guard this whole path exists to enforce would silently do nothing.
    const rawAssessedValue = context?.valuation_notice?.assessed_land_value;
    if (rawAssessedValue == null) {
      throw new ConflictException(
        `Dispute case #${disputeCase.id} has no assessed land value on its valuation notice, so ` +
          'the internal assessment cannot be checked against it.',
      );
    }
    const vgAssessedValue = Number(rawAssessedValue);

    if (internalAssessmentValue < vgAssessedValue) {
      throw new ConflictException(
        `Internal assessment value ($${internalAssessmentValue.toLocaleString()}) is less than the VG assessed value ` +
          `($${vgAssessedValue.toLocaleString()}). The case has viable objection grounds and should not be closed without objection.`,
      );
    }

    // Guard before any write, as the retired endpoint did.
    if (!context?.client?.email) {
      throw new ClientEmailMissingException(disputeCase.case_reference);
    }

    const advisoryToken = randomUUID();
    disputeCase.internal_assessed_value = internalAssessmentValue;
    // advisory_view_token is the sole discriminator for the no-objection close path now that
    // closed_no_objection has merged into case_closed. It is read by findAdvisoryView and by the
    // status migration's down(). Do not stop writing it.
    disputeCase.advisory_view_token = advisoryToken;
    disputeCase.advisory_view_token_expires_at = new Date(
      ctx.now.getTime() + ADVISORY_TOKEN_VALID_HOURS * 60 * 60 * 1000,
    );

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';
    const viewReportUrl = `${frontendUrl}/advisory-view?token=${advisoryToken}`;
    const payload = {
      clientEmail: context.client.email,
      clientName: context.client.name,
      caseReference: disputeCase.case_reference,
      propertyAddress: buildPropertyAddress(context.property),
      vgAssessedValue: formatAud(vgAssessedValue),
      internalAssessedValue: formatAud(internalAssessmentValue),
      assessorFullName:
        context.assigned_accountant?.fullName ?? DEFAULT_ADVISER_NAME,
      closedAt: formatAuDateTime(ctx.now),
      viewReportUrl,
    };

    // Failure is escalated rather than left to the generic post-commit log line: this email is the
    // ONLY delivery of a token that expires in ADVISORY_TOKEN_VALID_HOURS, there is no resend
    // endpoint, and the client is left waiting for a letter that will never arrive.
    ctx.postCommit.push(() =>
      this.azureEmailService
        .sendAdvisoryLetterNotification(payload)
        .catch((err: unknown) => {
          this.logger.error(
            `[STATUS] ADVISORY LETTER NOT DELIVERED for case ${disputeCase.case_reference} ` +
              `(${context.client.email}). The view token expires ` +
              `${formatAuDateTime(disputeCase.advisory_view_token_expires_at!, CORRESPONDENCE_TIME_ZONE)} ` +
              `and cannot be resent — contact the client directly: ${String(err)}`,
          );
          throw err;
        }),
    );
  }

  // ─── Shared effects ─────────────────────────────────────────────────────────────────────

  private mintLodgementReference(caseId: string): string {
    const year = new Date().getFullYear();
    const prefix = caseId.replace(/-/g, '').slice(0, 4).toUpperCase();
    return `LR-${year}-${prefix}-${randomInt(1000, 10000)}`;
  }

  /**
   * Awaited INSIDE the transaction: sending this email is the act of lodging with the Valuer
   * General, so if it fails the status change must roll back rather than claim a lodgement that
   * never happened.
   */
  private async sendVgLodgementEmail(
    ctx: HandlerContext,
    lodgementRef: string,
    submittedAt: Date,
  ): Promise<void> {
    const context = await this.loadCaseContext(ctx.manager, ctx.disputeCase.id);
    const vgEmail = this.config.getOrThrow<string>('VG_SUBMISSION_EMAIL');
    await this.azureEmailService.sendVgSubmissionConfirmation({
      sendTo: vgEmail,
      clientName: context?.client?.name ?? '',
      caseReference: ctx.disputeCase.case_reference,
      propertyAddress: buildPropertyAddress(context?.property),
      lodgmentReferenceNumber: lodgementRef,
      submittedAt: formatAuDateTime(submittedAt, CORRESPONDENCE_TIME_ZONE),
      assessorFullName: ctx.actor.fullName,
    });
  }

  private queueAccountantNotification(
    ctx: HandlerContext,
    message: string,
  ): void {
    const accountantId = ctx.disputeCase.assigned_accountant_id;
    if (!accountantId) return;
    ctx.postCommit.push(() =>
      this.notificationsService.create(
        accountantId,
        NotificationType.VG_RESPONSE_RECEIVED,
        message,
        ctx.disputeCase.id,
      ),
    );
  }

  /**
   * Client letter reporting how the objection ended.
   *
   * Takes the outcome rather than an `isApproved` boolean because the boolean could not tell
   * PARTIALLY_UPHELD apart from REJECTED: a client whose land value WAS reduced, just not to the
   * figure we contended for, was being sent the declined letter. WITHDRAWN sends nothing — the
   * client made that decision themselves and does not need to be told about it.
   */
  private queueVgOutcomeClientEmail(
    ctx: HandlerContext,
    outcome: OutcomeResult,
  ): void {
    if (outcome === OutcomeResult.WITHDRAWN) return;
    const isApproved =
      outcome === OutcomeResult.UPHELD ||
      outcome === OutcomeResult.PARTIALLY_UPHELD;
    const caseId = ctx.disputeCase.id;
    const caseRef = ctx.disputeCase.case_reference;
    const lodgementRef =
      ctx.disputeCase.lodgment_reference_number ?? NOT_RECORDED;
    const resolvedAt = formatAuDateTime(ctx.now, CORRESPONDENCE_TIME_ZONE);

    ctx.postCommit.push(async () => {
      const context = await this.loadCaseContext(
        this.dataSource.manager,
        caseId,
      );
      if (!context?.client?.email) return;
      const rawAssessedValue =
        context.original_assessed_value ??
        context.valuation_notice?.assessed_land_value;
      const assessedLandValue =
        rawAssessedValue != null
          ? formatAud(Number(rawAssessedValue))
          : NOT_RECORDED;
      return this.azureEmailService.sendVgResponseNotification({
        clientEmail: context.client.email,
        clientName: context.client.name,
        caseReference: caseRef,
        propertyAddress: buildPropertyAddress(context.property),
        lodgmentReferenceNumber: lodgementRef,
        isApproved,
        assessorFullName:
          context.assigned_accountant?.fullName ?? DEFAULT_ADVISER_NAME,
        resolvedAt,
        assessedLandValue,
      });
    });
  }

  /**
   * Relations for email payloads. A SEPARATE, UNLOCKED read — the row above is held under
   * FOR UPDATE and PostgreSQL will not join it.
   */
  private loadCaseContext(
    manager: EntityManager,
    id: string,
  ): Promise<DisputeCase | null> {
    return manager.findOne(DisputeCase, {
      where: { id },
      relations: [
        'client',
        'property',
        'valuation_notice',
        'assigned_accountant',
      ],
    });
  }

  private async writeAudit(
    manager: EntityManager,
    entry: {
      action: AuditAction;
      disputeCase: DisputeCase;
      from: DisputeStatus;
      to: DisputeStatus;
      actorId: string;
      actorRole: UserRole | typeof SYSTEM_ACTOR_ROLE;
      notes: string | null;
    },
  ): Promise<void> {
    const row = manager.create(AuditLog, {
      action: entry.action,
      performedBy: entry.actorId,
      performedByRole: entry.actorRole,
      caseId: entry.disputeCase.id,
      lodgmentReferenceNumber: entry.disputeCase.lodgment_reference_number,
      fromStatus: entry.from,
      toStatus: entry.to,
      notes: entry.notes,
    });
    await manager.save(AuditLog, row);
  }

  private toResponse(
    disputeCase: DisputeCase,
    from: DisputeStatus,
    changed: boolean,
  ): DisputeCaseStatusTransitionResponseDto {
    return {
      id: disputeCase.id,
      case_reference: disputeCase.case_reference,
      previousStatus: from,
      status: disputeCase.status,
      statusLabel: DISPUTE_STATUS_LABELS[disputeCase.status],
      changed,
      allowedNextStatuses: toStatusOptions(
        manualTransitionsFrom(disputeCase.status),
      ),
      submitted_at: disputeCase.submitted_at,
      lodgment_reference_number: disputeCase.lodgment_reference_number,
      closed_at: disputeCase.closed_at,
      resubmission_count: disputeCase.resubmission_count,
    };
  }

  // ─── System-driven writes ───────────────────────────────────────────────────────────────

  /**
   * Sets `analysed` after the AI analysis job completes.
   *
   * A single guarded UPDATE rather than a read-then-decide: `affected === 0` is a normal outcome
   * (the case has moved on, or was deleted) and must never throw. Throwing here would be caught by
   * the processor's outer try, fail the job, and trigger BullMQ retries that re-run non-idempotent
   * stages — duplicating comparables and objection reasons.
   *
   * `created` is in the writable set deliberately: POST /:id/analyze-ai has no status precondition
   * and seeders enqueue analysis against freshly created cases.
   *
   * The comparables floor is a PREDICATE, not a throw: it carries over the guard the retired
   * advance-to-appraisal endpoint used to enforce, without breaking the never-throw rule above. A
   * case short of comparables simply stays where it is, so the zero-row branch below has to name
   * the reason — otherwise the stall is undiagnosable.
   */
  async markAnalysed(caseId: string, source: string): Promise<boolean> {
    // The source statuses are BOUND, not inlined as an enum-cast array literal: listTransitions
    // reports the blocker for this same set, and a second spelling of the list would let the guard
    // and the explanation drift. Comparing as text also keeps this statement working across a
    // future vocabulary change instead of failing on a cast. The row is found by primary key, so
    // not using idx_dispute_cases_status costs nothing.
    const result: unknown = await this.dataSource.query(
      `UPDATE dispute_cases SET status = 'analysed'
        WHERE id = $1 AND deleted_at IS NULL
          AND status::text = ANY($3::text[])
          AND (${COMPARABLE_SALES_COUNT.replace('%CASE_ID%', '$1')}) >= $2`,
      [caseId, MINIMUM_COMPARABLES, [...MARK_ANALYSED_SOURCE_STATUSES]],
    );
    const affected = Array.isArray(result) ? Number(result[1] ?? 0) : 0;

    if (!affected) {
      this.logger.warn(
        `[STATUS] analysed not applied to case ${caseId} (source ${source}) — ${await this.explainAnalysedSkip(caseId)}`,
      );
      return false;
    }

    // The audit row must not be able to fail the job. This runs outside any transaction, so a
    // transient DB error here would propagate into the processor's outer try, fail a 20-minute
    // job and trigger the BullMQ retry this method's whole design exists to prevent.
    try {
      await this.dataSource.getRepository(AuditLog).save(
        this.dataSource.getRepository(AuditLog).create({
          action: AuditAction.ANALYSED,
          performedBy: SYSTEM_ACTOR_ID,
          performedByRole: SYSTEM_ACTOR_ROLE,
          caseId,
          toStatus: DisputeStatus.ANALYSED,
          notes: source,
        }),
      );
    } catch (error) {
      this.logger.error(
        `[STATUS] case ${caseId} moved to analysed but the audit row failed to write: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    this.logger.log(`[STATUS] case ${caseId} -> analysed (source ${source})`);
    return true;
  }

  /**
   * Why the guarded UPDATE above matched no row. Diagnostics only — runs solely on the skip path
   * and never throws, so a failure here can never turn a benign skip into a failed job.
   */
  private async explainAnalysedSkip(caseId: string): Promise<string> {
    try {
      const rows: unknown = await this.dataSource.query(
        `SELECT dc.status::text AS status, dc.deleted_at IS NOT NULL AS deleted,
                (${COMPARABLE_SALES_COUNT.replace('%CASE_ID%', 'dc.id')}) AS comparables
           FROM dispute_cases dc WHERE dc.id = $1`,
        [caseId],
      );
      const row = Array.isArray(rows)
        ? (rows[0] as Record<string, unknown> | undefined)
        : undefined;
      if (!row) return 'the case no longer exists';
      if (row.deleted) return 'the case is deleted';

      const comparables = Number(row.comparables ?? 0);
      if (comparables < MINIMUM_COMPARABLES) {
        return `only ${comparables} of the ${MINIMUM_COMPARABLES} required comparable sales are on file — the case stays at '${String(row.status)}' until more are added`;
      }
      return `it is already at '${String(row.status)}'`;
    } catch {
      return 'reason could not be determined';
    }
  }
}
