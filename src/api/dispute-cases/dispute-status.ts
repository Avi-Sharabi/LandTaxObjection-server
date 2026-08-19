import { DisputeStatus } from './entities/dispute-case.entity';

/**
 * Single source of truth for everything the dispute-case status vocabulary means.
 *
 * A plain constants module — deliberately not a Nest provider — so `dashboard`,
 * `objection-package`, `clients`, `valuation` and `common/dto` can all import it with no
 * circular-module risk. It imports the enum from the entity, so the entity must never
 * import from here.
 *
 * Adding a status is a COMPILE ERROR until it appears in DISPUTE_STATUS_ORDER (tripwire below),
 * DISPUTE_STATUS_LABELS, DISPUTE_STATUS_REPORT_PHRASES, DISPUTE_STATUS_TRANSITIONS and
 * DISPUTE_STATUS_TRANSITION_ACTOR — all four are exhaustive Records.
 */

/**
 * Lifecycle order. Also the dashboard display order, and the order the PostgreSQL enum labels
 * are created in (see 1785800000000-ReplaceDisputeStatusVocabulary), so `enumsortorder` follows
 * the lifecycle too.
 *
 * DISPLAY ORDER ONLY — never use indexOf on this to reason about progress. The lifecycle is
 * cyclic: AI_FURTHER_SUBMISSION re-enters at VG_RESPONSE_RECEIVED, so ordinal comparison is
 * unsound by construction. Use DISPUTE_STATUS_TRANSITIONS for legality and the explicit sets
 * below for membership.
 */
const DISPUTE_STATUS_ORDER = [
  DisputeStatus.CREATED,
  DisputeStatus.TNC_AGREED,
  DisputeStatus.REPORTS_UPLOADED,
  DisputeStatus.ANALYSED,
  DisputeStatus.OBJECTION_SUBMITTED,
  DisputeStatus.VG_RESPONSE_RECEIVED,
  DisputeStatus.AI_FURTHER_SUBMISSION,
  DisputeStatus.VG_AGREED,
  DisputeStatus.CASE_CLOSED,
] as const;

// Compile-time tripwire: a DisputeStatus[] literal is never exhaustiveness-checked by TypeScript,
// which is exactly how the old STATUS_ORDER silently omitted a status and made indexOf return -1.
// A miss here surfaces as the status name in the error text.
type MissingFromOrder = Exclude<
  DisputeStatus,
  (typeof DISPUTE_STATUS_ORDER)[number]
>;
const _orderIsExhaustive: MissingFromOrder extends never
  ? true
  : ['MISSING FROM DISPUTE_STATUS_ORDER', MissingFromOrder] = true;
void _orderIsExhaustive;

/** Product-owner wording. Dashboard chip, status filter, notifications, Swagger prose. */
export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  [DisputeStatus.CREATED]: 'Created',
  [DisputeStatus.TNC_AGREED]: 'T&C agreed',
  [DisputeStatus.REPORTS_UPLOADED]: 'Land value and sales report uploaded',
  [DisputeStatus.ANALYSED]: 'Analysed',
  [DisputeStatus.OBJECTION_SUBMITTED]:
    'Objection Submitted/waiting for a VG response',
  [DisputeStatus.VG_RESPONSE_RECEIVED]: 'VG response received',
  [DisputeStatus.AI_FURTHER_SUBMISSION]: 'YML AI further submission',
  [DisputeStatus.VG_AGREED]: 'VG agree',
  [DisputeStatus.CASE_CLOSED]: 'Case closed',
};

/**
 * Report-grade phrasing for the PDF "Case Status" cover fact and the valuation-report LLM prompt.
 * Separate from the chip labels because it MUST NOT imply lodgement for any status a case can
 * hold before it has been lodged — see src/skills/valuation/section_guide.md.
 */
export const DISPUTE_STATUS_REPORT_PHRASES: Record<DisputeStatus, string> = {
  [DisputeStatus.CREATED]: 'Created — case intake in progress; not yet lodged',
  [DisputeStatus.TNC_AGREED]:
    'Terms & conditions agreed — supporting documents not yet on file; not yet lodged',
  [DisputeStatus.REPORTS_UPLOADED]:
    'Land value search and sales report on file — analysis pending; not yet lodged',
  [DisputeStatus.ANALYSED]: 'Internal analysis complete — not yet lodged',
  [DisputeStatus.OBJECTION_SUBMITTED]:
    'Lodged with the Valuer General — awaiting response',
  [DisputeStatus.VG_RESPONSE_RECEIVED]:
    'VG response received — outcome under review',
  [DisputeStatus.AI_FURTHER_SUBMISSION]:
    'Further submission lodged with the Valuer General — awaiting response',
  [DisputeStatus.VG_AGREED]: 'VG objection approved',
  [DisputeStatus.CASE_CLOSED]: 'Case closed',
};

// ─── Status sets ──────────────────────────────────────────────────────────────────────────

/** Case is finished. */
export const CLOSED_STATUSES: readonly DisputeStatus[] = [
  DisputeStatus.CASE_CLOSED,
];

/**
 * Excluded from the dashboard's active / due-this-week / overdue counters.
 * Equal to CLOSED_STATUSES today but kept separate: vg_agreed is deliberately still ACTIVE,
 * because the fee and the file-close are outstanding work, so the two concepts can diverge.
 */
export const DASHBOARD_INACTIVE_STATUSES: readonly DisputeStatus[] = [
  DisputeStatus.CASE_CLOSED,
];

/**
 * Statuses in which inbound VG correspondence may be matched to a case. vg_response_received is
 * included because a follow-up email about the same case must still resolve to it while the reply
 * sits in the review queue.
 *
 * Consumed as raw SQL bind parameters (`dc.status = ANY($n)`) — a stale literal there would return
 * zero rows WITHOUT erroring, silently breaking the email monitor, so these stay enum members.
 */
export const VG_EMAIL_MATCHABLE_STATUSES: readonly DisputeStatus[] = [
  DisputeStatus.OBJECTION_SUBMITTED,
  DisputeStatus.VG_RESPONSE_RECEIVED,
  DisputeStatus.AI_FURTHER_SUBMISSION,
];

/**
 * Lodged and genuinely still waiting — the VG follow-up cron chases exactly these.
 * Any writer that sets a status listed here MUST, in the same transaction, reset
 * `vg_follow_up_count = 0` and `last_vg_follow_up_sent_at = null` and stamp a submission
 * timestamp, or the cron will either chase a stale submission or never fire again.
 */
export const AWAITING_VG_RESPONSE_STATUSES: readonly DisputeStatus[] = [
  DisputeStatus.OBJECTION_SUBMITTED,
  DisputeStatus.AI_FURTHER_SUBMISSION,
];

/**
 * The statuses the AI analysis job may move to `analysed` from. `created` is included because
 * POST /:id/analyze-ai has no status precondition and seeders enqueue analysis against freshly
 * created cases.
 *
 * Exported so DisputeStatusTransitionService.markAnalysed binds it as a query parameter and
 * listTransitions tests against the same set — a second hardcoded list would let the guarded
 * UPDATE and the blocker it reports drift apart.
 */
export const MARK_ANALYSED_SOURCE_STATUSES: readonly DisputeStatus[] = [
  DisputeStatus.CREATED,
  DisputeStatus.TNC_AGREED,
  DisputeStatus.REPORTS_UPLOADED,
];

/** At or after the internal analysis being submitted. */
const POST_ANALYSIS_STATUSES: readonly DisputeStatus[] = [
  DisputeStatus.ANALYSED,
  DisputeStatus.OBJECTION_SUBMITTED,
  DisputeStatus.VG_RESPONSE_RECEIVED,
  DisputeStatus.AI_FURTHER_SUBMISSION,
  DisputeStatus.VG_AGREED,
  DisputeStatus.CASE_CLOSED,
];

/**
 * At or after first lodgement. NOTE this is a REACHABILITY set, not a test for "has been lodged" —
 * case_closed is a member because it is reachable from lodged statuses, but it also contains
 * never-lodged advisory closes. To ask whether a case was actually lodged, test
 * `submitted_at !== null`; see valuation-report.service.ts.
 *
 * Also consumed by `deadlines.service.ts` to exclude cases from statutory-deadline tracking:
 * `statutory_deadline` is the lodgement deadline, so a case at or after lodgement has already
 * met it and is no longer deadline-tracked.
 */
export const POST_LODGEMENT_STATUSES: readonly DisputeStatus[] = [
  DisputeStatus.OBJECTION_SUBMITTED,
  DisputeStatus.VG_RESPONSE_RECEIVED,
  DisputeStatus.AI_FURTHER_SUBMISSION,
  DisputeStatus.VG_AGREED,
  DisputeStatus.CASE_CLOSED,
];

export const isAtOrAfterAnalysis = (status: DisputeStatus): boolean =>
  POST_ANALYSIS_STATUSES.includes(status);

export const isAtOrAfterLodgement = (status: DisputeStatus): boolean =>
  POST_LODGEMENT_STATUSES.includes(status);

// ─── The lifecycle graph ──────────────────────────────────────────────────────────────────

/**
 * Every legal MANUAL move, keyed by the CURRENT status.
 *
 * Not every transition in the system: the two system-written promotions are guarded UPDATEs whose
 * source status is embedded in their own SQL — `tnc_agreed -> reports_uploaded`
 * (AssessmentDocumentsRepository.promoteToReportsUploadedIfComplete) and
 * MARK_ANALYSED_SOURCE_STATUSES `-> analysed` (DisputeStatusTransitionService.markAnalysed). Both
 * are accounted for in the dominator predecessors below; neither is validated against this table.
 *
 * Deliberate properties:
 *  - `case_closed` is reachable from every open status (clients withdraw, deadlines lapse, and
 *    the advisory close fires from a pre-lodgement status).
 *  - `case_closed` is terminal. There is no reopen; corrections go through the admin override.
 *  - NO backward edges. A correction is not a lifecycle event and must never be able to re-run
 *    a side effect — a vg_agreed -> objection_submitted edge would re-mint the lodgement
 *    reference and re-email the Valuer General.
 *  - NO self-edges. The no-op is handled before this table is consulted, so a double-click
 *    cannot re-run effects.
 *  - objection_submitted -> vg_agreed is intentionally absent: a VG reply is recorded as
 *    `vg_response_received` first. Because this graph is data, adding that edge later is a
 *    one-line change with no code change.
 */
const DISPUTE_STATUS_TRANSITIONS: Record<
  DisputeStatus,
  readonly DisputeStatus[]
> = {
  [DisputeStatus.CREATED]: [
    DisputeStatus.TNC_AGREED,
    DisputeStatus.CASE_CLOSED,
  ],
  [DisputeStatus.TNC_AGREED]: [
    DisputeStatus.REPORTS_UPLOADED,
    DisputeStatus.CASE_CLOSED,
  ],
  [DisputeStatus.REPORTS_UPLOADED]: [
    DisputeStatus.ANALYSED,
    DisputeStatus.CASE_CLOSED,
  ],
  [DisputeStatus.ANALYSED]: [
    DisputeStatus.OBJECTION_SUBMITTED,
    DisputeStatus.CASE_CLOSED,
  ],
  [DisputeStatus.OBJECTION_SUBMITTED]: [
    DisputeStatus.VG_RESPONSE_RECEIVED,
    DisputeStatus.CASE_CLOSED,
  ],
  [DisputeStatus.VG_RESPONSE_RECEIVED]: [
    DisputeStatus.AI_FURTHER_SUBMISSION,
    DisputeStatus.VG_AGREED,
    DisputeStatus.CASE_CLOSED,
  ],
  // THE CYCLIC EDGE — a further submission re-enters the VG loop. This single backward edge is
  // the whole reason ordinal comparison over DISPUTE_STATUS_ORDER is unsound.
  [DisputeStatus.AI_FURTHER_SUBMISSION]: [
    DisputeStatus.VG_RESPONSE_RECEIVED,
    DisputeStatus.CASE_CLOSED,
  ],
  [DisputeStatus.VG_AGREED]: [DisputeStatus.CASE_CLOSED],
  [DisputeStatus.CASE_CLOSED]: [],
};

/** Who is allowed to drive a case INTO each status. */
enum TransitionActor {
  /** Written only by the system — unreachable over HTTP by construction. */
  SYSTEM = 'system',
  /** Written by a person through PATCH /v1/dispute-cases/:id/status. */
  MANUAL = 'manual',
}

const DISPUTE_STATUS_TRANSITION_ACTOR: Record<DisputeStatus, TransitionActor> =
  {
    [DisputeStatus.CREATED]: TransitionActor.SYSTEM, // intake orchestrator
    [DisputeStatus.TNC_AGREED]: TransitionActor.MANUAL,
    [DisputeStatus.REPORTS_UPLOADED]: TransitionActor.SYSTEM, // POST /assessment-documents/batch
    [DisputeStatus.ANALYSED]: TransitionActor.SYSTEM, // analyze-ai job completion
    [DisputeStatus.OBJECTION_SUBMITTED]: TransitionActor.MANUAL,
    [DisputeStatus.VG_RESPONSE_RECEIVED]: TransitionActor.MANUAL,
    [DisputeStatus.AI_FURTHER_SUBMISSION]: TransitionActor.MANUAL,
    [DisputeStatus.VG_AGREED]: TransitionActor.MANUAL,
    [DisputeStatus.CASE_CLOSED]: TransitionActor.MANUAL,
  };

export const canTransition = (
  from: DisputeStatus,
  to: DisputeStatus,
): boolean => DISPUTE_STATUS_TRANSITIONS[from].includes(to);

// ─── What a status PROVES about the past ──────────────────────────────────────────────────
//
// A case-detail timeline wants to tick "Reports uploaded" for a case sitting on
// `reports_uploaded`, whether or not an audit row exists. The question behind that is:
// "must a case now on X have passed through Y?" — which is the definition of Y DOMINATING X,
// with `created` as the entry node.
//
// Dominators, not ancestors: `case_closed` is REACHABLE from every status, so its ancestor set
// is the whole graph, but its dominator set is {created, case_closed} — a case closed straight
// from `created` proves nothing happened. Ordinal comparison over DISPUTE_STATUS_ORDER gets this
// catastrophically wrong and lights every row.

/**
 * The real edge set, which is NOT DISPUTE_STATUS_TRANSITIONS alone.
 *
 * `markAnalysed` writes `analysed` with a guarded raw UPDATE from any of
 * MARK_ANALYSED_SOURCE_STATUSES — including `created` and `tnc_agreed`. Those are genuine
 * production edges that skip `reports_uploaded` entirely, and computing dominators without them
 * concludes that `analysed` proves `reports_uploaded`. That is not a near-miss: every case the
 * AI job analyses straight from `created` would claim, on a compliance-adjacent screen, that
 * reports were uploaded when none were.
 *
 * Derived from the same exported constant markAnalysed binds as a query parameter, so the two
 * cannot drift.
 */
const dominatorPredecessors = (): Map<DisputeStatus, DisputeStatus[]> => {
  const preds = new Map<DisputeStatus, DisputeStatus[]>(
    DISPUTE_STATUS_ORDER.map((s) => [s, []]),
  );
  for (const from of DISPUTE_STATUS_ORDER)
    for (const to of DISPUTE_STATUS_TRANSITIONS[from])
      preds.get(to)!.push(from);
  for (const from of MARK_ANALYSED_SOURCE_STATUSES) {
    const into = preds.get(DisputeStatus.ANALYSED)!;
    if (!into.includes(from)) into.push(from);
  }
  return preds;
};

/**
 * Iterative dominator dataflow: Dom(entry) = {entry}; Dom(n) = {n} ∪ ⋂ Dom(p) for p ∈ preds(n).
 *
 * Initialised OPTIMISTICALLY to the full node set — seeding empty converges to the wrong answer
 * inside the vg_response_received <-> ai_further_submission cycle. Nine nodes, so this runs once
 * at module load.
 */
const computeStatusDominators = (): Record<
  DisputeStatus,
  ReadonlySet<DisputeStatus>
> => {
  const entry = DisputeStatus.CREATED;
  const preds = dominatorPredecessors();

  const dom = new Map<DisputeStatus, Set<DisputeStatus>>(
    DISPUTE_STATUS_ORDER.map((s) => [
      s,
      new Set<DisputeStatus>(s === entry ? [entry] : DISPUTE_STATUS_ORDER),
    ]),
  );

  for (let changed = true; changed; ) {
    changed = false;
    for (const node of DISPUTE_STATUS_ORDER) {
      if (node === entry) continue;
      const incoming = preds.get(node)!;
      // A FRESH set per reduce: seeding with a predecessor's own Set would let the add() below
      // mutate that neighbour's dominators through the alias.
      const next = incoming.length
        ? incoming
            .map((p) => dom.get(p)!)
            .reduce(
              (acc, set) => new Set([...acc].filter((s) => set.has(s))),
              new Set<DisputeStatus>(DISPUTE_STATUS_ORDER),
            )
        : new Set<DisputeStatus>();
      next.add(node);
      // Sets only shrink from the universal set, so size is a sound change detector.
      if (next.size !== dom.get(node)!.size) {
        dom.set(node, next);
        changed = true;
      }
    }
  }

  // Built key by key rather than via Object.fromEntries, whose string-keyed return type does not
  // narrow to the Record and would need an unchecked double cast.
  const result = {} as Record<DisputeStatus, ReadonlySet<DisputeStatus>>;
  for (const status of DISPUTE_STATUS_ORDER) result[status] = dom.get(status)!;
  return result;
};

const STATUS_DOMINATORS = computeStatusDominators();

/**
 * Statuses a case now on `status` must have held, including `status` itself.
 *
 * A LOWER BOUND, never a history. `false` means "no path guarantees it", NOT "it did not
 * happen" — an admin force assigns a status with no graph check, and migration
 * 1785800000000 remapped legacy statuses onto cases that never traversed them. Callers must
 * union this with whatever independent timestamps they hold, and nothing that gates a write
 * may consume it.
 */
export const statusesImpliedBy = (
  status: DisputeStatus,
): readonly DisputeStatus[] => [...STATUS_DOMINATORS[status]];

/**
 * Must a case now on `current` have passed through `candidate`? True when they are equal.
 *
 * No production caller — the API exposes the whole set via statusesImpliedBy instead. Kept because
 * it is how dispute-status.spec.ts asserts the dominator table pairwise, which is the only thing
 * standing between computeStatusDominators and a silent wrong answer.
 */
export const statusImplies = (
  current: DisputeStatus,
  candidate: DisputeStatus,
): boolean => STATUS_DOMINATORS[current].has(candidate);

export const isManualTarget = (to: DisputeStatus): boolean =>
  DISPUTE_STATUS_TRANSITION_ACTOR[to] === TransitionActor.MANUAL;

/** Manual targets reachable from `from` — the frontend's action menu. */
export const manualTransitionsFrom = (
  from: DisputeStatus,
): readonly DisputeStatus[] =>
  DISPUTE_STATUS_TRANSITIONS[from].filter(isManualTarget);

/** Every status a person may set. Drives the request DTO's @IsIn, so system-only targets are
 *  rejected by the validation pipe rather than by an `if` in the service. */
export const MANUAL_TRANSITION_TARGETS: readonly DisputeStatus[] =
  DISPUTE_STATUS_ORDER.filter(isManualTarget);

/**
 * Shapes statuses for the API. `order` is always the LIFECYCLE position, never the index within
 * the array being mapped — otherwise the same field means different things on GET /statuses and
 * GET /:id/transitions, and a client cannot sort one against the other.
 */
export const toStatusOptions = (
  statuses: readonly DisputeStatus[],
): { value: DisputeStatus; label: string; order: number }[] =>
  statuses.map((status) => ({
    value: status,
    label: DISPUTE_STATUS_LABELS[status],
    order: DISPUTE_STATUS_ORDER.indexOf(status),
  }));

/** Vocabulary payload for the dashboard status column and filter dropdown. */
export const disputeStatusOptions = (): {
  value: DisputeStatus;
  label: string;
  order: number;
}[] => toStatusOptions(DISPUTE_STATUS_ORDER);
