/**
 * Classifies comparable sales for the purposes of a headline $/m² median:
 * - Part-interest sales (interest_of_sale_percent > 0) are excluded outright — a fractional
 *   interest transaction's price is not comparable to a whole-property arm's-length sale.
 *   NULL/0 is treated as full-interest (the overwhelming default in this data).
 * - Among the remaining full-interest, rated sales, statistical outliers are trimmed via a
 *   Tukey IQR fence (Q1 - 1.5*IQR .. Q3 + 1.5*IQR) — the standard, well-documented method for
 *   flagging extreme values without assuming a particular distribution shape.
 *
 * Quarantined items are NOT dropped by this function — callers decide whether to still show
 * them (e.g. for report-body transparency) while excluding them from the median math.
 */
export interface QuarantinableComparable {
  interest_of_sale_percent: number | string | null;
  adjusted_rate_per_sqm: number | string | null;
}

export interface QuarantinedItem<T> {
  item: T;
  reason: string;
}

export interface ClassifyResult<T> {
  eligible: T[];
  quarantined: QuarantinedItem<T>[];
}

const MIN_SAMPLE_FOR_IQR_TRIM = 4; // quartiles degenerate below this — see rationale below
const IQR_FENCE_MULTIPLIER = 1.5;  // Tukey's standard fence multiplier

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-AU');
}

// Linear-interpolation percentile (a.k.a. Excel PERCENTILE.INC / numpy default) — the most
// common, defensible definition of a quartile for a small, already-sorted sample.
function percentile(sortedAsc: number[], p: number): number {
  const rank = p * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (rank - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

export function classifyComparablesForMedian<T extends QuarantinableComparable>(
  items: T[],
): ClassifyResult<T> {
  const partInterest: QuarantinedItem<T>[] = [];
  const fullInterest: T[] = [];

  for (const item of items) {
    const pct = item.interest_of_sale_percent != null ? Number(item.interest_of_sale_percent) : null;
    // A malformed (non-numeric) or negative value is not a documented "whole interest" case —
    // only null/0 are. Fail-closed the same direction as a genuine partial-interest sale, matching
    // ComparablesService.filterPartialInterestSales/dedupeByDealingNumber's treatment of the same
    // malformed value — otherwise a negative value here would be silently treated as full-interest
    // and folded into the median even though the AI-generation gates would have excluded it.
    const isUnverifiable = pct != null && (!isFinite(pct) || pct < 0);
    const isPartInterest = isUnverifiable || (pct != null && pct > 0);
    if (isPartInterest) {
      partInterest.push({
        item,
        reason: `Part-interest sale (interest of sale = ${pct}%) — this transaction did not convey ` +
          `the whole/fee-simple interest, so its price is not directly comparable to a full-value ` +
          `sale; excluded from the headline $/m² calculation.`,
      });
    } else {
      fullInterest.push(item);
    }
  }

  const ratedSet = new Set<T>();
  const rated: Array<{ item: T; rate: number }> = [];
  for (const item of fullInterest) {
    const rate = item.adjusted_rate_per_sqm != null ? Number(item.adjusted_rate_per_sqm) : null;
    if (rate != null && isFinite(rate)) {
      rated.push({ item, rate });
      ratedSet.add(item);
    }
  }
  // Full-interest comps with no usable rate at all aren't "outliers" — there's nothing to judge
  // them against — they just naturally don't contribute to the median (same as today).
  const noRate = fullInterest.filter(item => !ratedSet.has(item));

  if (rated.length < MIN_SAMPLE_FOR_IQR_TRIM) {
    // n<4: Q1/Q3 collapse toward the sample extremes and any fence computed from them is
    // arbitrary, not a meaningful statistical statement — skip statistical trimming entirely
    // rather than flag something on a coin-flip basis.
    return { eligible: [...fullInterest], quarantined: partInterest };
  }

  const sortedRates = rated.map(r => r.rate).sort((a, b) => a - b);
  const q1 = percentile(sortedRates, 0.25);
  const q3 = percentile(sortedRates, 0.75);
  const iqr = q3 - q1;

  if (iqr === 0) {
    // Degenerate fence (rated sales cluster on ~identical $/m²) — a zero-width IQR would flag
    // any nonzero deviation as an "outlier", which isn't meaningful with this little variance.
    return { eligible: [...fullInterest], quarantined: partInterest };
  }

  const lowerFence = q1 - IQR_FENCE_MULTIPLIER * iqr;
  const upperFence = q3 + IQR_FENCE_MULTIPLIER * iqr;

  const eligible: T[] = [...noRate];
  const outliers: QuarantinedItem<T>[] = [];
  for (const { item, rate } of rated) {
    if (rate < lowerFence || rate > upperFence) {
      outliers.push({
        item,
        reason: `Statistical outlier — adjusted rate ${money(rate)}/m² falls outside the IQR fence ` +
          `(${money(lowerFence)}–${money(upperFence)}/m², from Q1=${money(q1)}, Q3=${money(q3)} across ` +
          `${rated.length} full-interest comparables) — excluded from the headline $/m² calculation.`,
      });
    } else {
      eligible.push(item);
    }
  }

  return { eligible, quarantined: [...partInterest, ...outliers] };
}
