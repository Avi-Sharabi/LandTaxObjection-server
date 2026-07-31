/**
 * The grammar of `dispute_cases.evidence_strength_rationale`, plus the score bands, in one place.
 *
 * That column carries two sections written by EvidenceScoreService.serialiseRationale():
 *
 *   (34) Comparables - <one sentence>
 *   (20) Reason For Objection - <one sentence>
 *   (18) Supporting Evidence - <one sentence>
 *   (10) Documents - <one sentence>
 *   Recommendations:
 *   [+6] Supporting Evidence - <one imperative sentence>
 *
 * One WRITER (serialiseRationale) and three READERS: EvidenceScoreReportService, the frontend's
 * parseEvidenceRationale() in caseDetail/utils/format.js, and — via checkRationaleSum — the writer's
 * own self-check. The regexes below are the authoritative backend copy; EvidenceScoreService imports
 * them rather than declaring its own, so the writer and the readers are provably the same grammar.
 * The frontend copy is the one that still has to be kept in step by hand.
 */

// The four fixed labels the rationale format requires, in order.
export const RATIONALE_LABELS = [
  'Comparables',
  'Reason For Objection',
  'Supporting Evidence',
  'Documents',
] as const;

export type RationaleLabel = (typeof RATIONALE_LABELS)[number];

/**
 * Exact-match allowlist test for a group label.
 *
 * A predicate rather than a bare `RATIONALE_LABELS.includes(x)` at each call site because the tuple
 * is `as const`, so `includes` will not accept a plain `string` — and widening the tuple to
 * `string[]` to work around that would give up the union type the rest of the module depends on.
 */
export function isRationaleLabel(value: string): value is RationaleLabel {
  return (RATIONALE_LABELS as readonly string[]).includes(value);
}

/**
 * Marker line separating the breakdown from the recommendations inside the one column.
 *
 * Its PRESENCE is what distinguishes "this run produced no recommendations worth listing" from "no
 * run has ever produced recommendations for this case" — the two states a reader needs told apart,
 * and the only reason the sections can share one column at all. Absent entirely => never computed.
 */
export const RECOMMENDATIONS_MARKER = 'Recommendations:';
export const RECOMMENDATIONS_NONE = `${RECOMMENDATIONS_MARKER} none`;

/**
 * Captures the points off one breakdown line, e.g. "(34) Comparables - ...".
 *
 * En/em dashes are accepted as separators because a model that drifts to one would otherwise make the
 * whole breakdown look like a total of zero. The label group is lazy so it stops at the FIRST
 * separator, leaving hyphens inside the explanation (rate ranges like $1,040-$1,110/m²) intact.
 *
 * Deliberately narrower than the frontend's copy, which also accepts `N/A` in the points group: this
 * one feeds checkRationaleSum(), where an unparseable points value must count as off-format rather
 * than as zero. An `N/A` line therefore yields fewer than four rows and the report falls back to
 * rendering the stored text as prose — the honest outcome. Do not widen it.
 */
export const RATIONALE_LINE = /^\(\s*(\d{1,3})\s*\)\s*(.+?)\s+[-–—]\s+(.*)$/;

/**
 * The recommendation lines that follow the marker, e.g. "[+6] Comparables - Add two more sales."
 *
 * Square brackets, not the round ones the breakdown uses, so neither parser can mistake a lift for a
 * group's points — those four must keep summing to the score, and a lift counted among them would
 * break that arithmetic.
 */
export const RECOMMENDATION_LINE = /^\[\+?\s*(\d{1,3})\s*\]\s*(.+?)\s+[-–—]\s+(.*)$/;

/** The marker line itself, with or without the trailing "none". */
export const RECOMMENDATIONS_MARKER_LINE = /^Recommendations:\s*(none)?$/i;

export interface ParsedRationaleRow {
  label: string;
  points: number;
  explanation: string;
}

export interface ParsedRecommendation {
  group: string;
  action: string;
  lift: number;
}

export interface ParsedEvidenceRationale {
  rows: ParsedRationaleRow[];
  /** Legacy single-sentence rationale. Non-null only when `rows` is empty. */
  prose: string | null;
  /** Sum of rows[].points. Null when there are no rows. */
  total: number | null;
  /** null = no run has ever produced recommendations; [] = a run found nothing material left. */
  recommendations: ParsedRecommendation[] | null;
}

/**
 * Parses the stored rationale for rendering.
 *
 * A string that does not parse is returned as `{ rows: [], prose }` rather than dropped: scores
 * written before the breakdown format existed are a single prose sentence and those rows are still in
 * the database. A partial parse keeps whatever lines did match, because a rationale that lost one
 * line is still worth showing.
 *
 * Line-test order (marker, then recommendation, then breakdown) mirrors the frontend exactly.
 */
export function parseEvidenceRationale(
  rationale: string | null | undefined,
): ParsedEvidenceRationale {
  if (typeof rationale !== 'string' || rationale.trim() === '') {
    return { rows: [], prose: null, total: null, recommendations: null };
  }

  const text = rationale.trim();
  const rows: ParsedRationaleRow[] = [];
  const recommendations: ParsedRecommendation[] = [];
  let sawMarker = false;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();

    if (RECOMMENDATIONS_MARKER_LINE.test(line)) {
      sawMarker = true;
      continue;
    }

    const recommendation = RECOMMENDATION_LINE.exec(line);
    if (recommendation) {
      recommendations.push({
        group: recommendation[2].trim(),
        action: recommendation[3].trim(),
        lift: Number(recommendation[1]),
      });
      continue;
    }

    const row = RATIONALE_LINE.exec(line);
    if (row) {
      rows.push({
        label: row[2].trim(),
        points: Number(row[1]),
        explanation: row[3].trim(),
      });
    }
  }

  // A recommendation line without the marker still counts as computed: the marker is how the EMPTY
  // case is expressed, not a precondition for the items.
  const parsedRecommendations = sawMarker || recommendations.length > 0 ? recommendations : null;

  if (rows.length === 0) {
    // Only the breakdown falls back to prose. Feeding a stray recommendations block into the prose
    // slot would show the reader the raw storage format inside a client-facing PDF.
    return {
      rows: [],
      prose: parsedRecommendations === null ? text : null,
      total: null,
      recommendations: parsedRecommendations,
    };
  }

  return {
    rows,
    prose: null,
    total: rows.reduce((sum, row) => sum + row.points, 0),
    recommendations: parsedRecommendations,
  };
}

export interface ScoreBand {
  min: number;
  max: number;
  label: string;
  meaning: string;
}

/**
 * Copied verbatim from the "## Bands" table in src/skills/evidence-score.md.
 *
 * The scoring model is TOLD these exact anchors, so anything that reports a band must not restate
 * them differently. Contiguous and gapless over 0-100. If that table changes, change this and only
 * this — nothing else in the codebase encodes band boundaries.
 */
export const SCORE_BANDS: readonly ScoreBand[] = [
  {
    min: 90,
    max: 100,
    label: 'Exceptional',
    meaning:
      'Highly persuasive, well-corroborated package. Documented or confirmed evidence, tight comparables and/or strongly substantiated property or statutory grounds. No material weakness left.',
  },
  {
    min: 80,
    max: 89,
    label: 'Strong',
    meaning:
      "Clearly persuasive; an assessor would have to engage with it seriously. Minor or moderate gaps remain but don't threaten the core case.",
  },
  {
    min: 70,
    max: 79,
    label: 'Good / Solid',
    meaning:
      'Credible and defensible, with noticeable gaps in verification, documentation, comparability or analysis.',
  },
  {
    min: 60,
    max: 69,
    label: 'Reasonably Supported',
    meaning:
      'Real evidentiary foundation, but several important elements are incomplete, estimated or thinly verified.',
  },
  {
    min: 45,
    max: 59,
    label: 'Moderate',
    meaning: 'A genuine argument exists; support is thin, mixed or substantially unverified.',
  },
  {
    min: 30,
    max: 44,
    label: 'Weak',
    meaning: 'Limited persuasive evidence; important claims unsupported or comparables poor.',
  },
  {
    min: 0,
    max: 29,
    label: 'Minimal',
    meaning: 'Almost nothing usable, severe contradictions, or essentially non-actionable.',
  },
];

/**
 * The band a score sits in, or null when there is no score.
 *
 * Clamps before matching so a stored value outside 0-100 (which the smallint column permits) still
 * resolves to the nearest real band rather than to null.
 */
export function resolveScoreBand(score: number | null | undefined): ScoreBand | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  // The ?? null is unreachable while the table stays contiguous over 0-100. Kept so a future edit
  // that opens a gap surfaces as a "-" in one cell rather than as a thrown exception in a worker.
  return SCORE_BANDS.find((band) => clamped >= band.min && clamped <= band.max) ?? null;
}

export interface ScorableEvidenceCounts {
  comparables: number;
  tickedIssues: number;
  tickedGrounds: number;
}

/**
 * Whether a case has enough on file to be scored at all.
 *
 * An untouched case scores null, not 0 — 0 is the claim "we assessed this and the evidence is
 * worthless", which is false and misleading before any AI run. Gates on TICKED counts: a run where
 * nothing was ticked asserts no evidence at all. Documents alone do not open the gate; an uploaded
 * notice with no analysis behind it is the input to a case, not evidence for one.
 *
 * Shared so EvidenceScoreService's gate and the report's reading of why a case has no score cannot
 * drift apart — the report tells the user which of these three clauses is unmet.
 */
export function hasScorableEvidence(counts: ScorableEvidenceCounts): boolean {
  return counts.comparables > 0 || counts.tickedIssues > 0 || counts.tickedGrounds > 0;
}
