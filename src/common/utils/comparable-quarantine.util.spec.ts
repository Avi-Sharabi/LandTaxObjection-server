import { classifyComparablesForMedian, QuarantinableComparable } from './comparable-quarantine.util';

function comp(rate: number | null, interestPct: number | null = 0): QuarantinableComparable {
  return { adjusted_rate_per_sqm: rate, interest_of_sale_percent: interestPct };
}

describe('classifyComparablesForMedian', () => {
  it('excludes a part-interest sale (interest_of_sale_percent > 0)', () => {
    const partial = comp(3000, 33);
    const result = classifyComparablesForMedian([partial]);

    expect(result.eligible).toEqual([]);
    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0].item).toBe(partial);
    expect(result.quarantined[0].reason).toContain('Part-interest sale');
  });

  it('treats interest_of_sale_percent of 0 or null as full interest (eligible)', () => {
    const zero = comp(3000, 0);
    const nullInterest = comp(3000, null);
    const result = classifyComparablesForMedian([zero, nullInterest]);

    expect(result.eligible).toEqual([zero, nullInterest]);
    expect(result.quarantined).toEqual([]);
  });

  it('flags a statistical outlier on a synthetic sample using a hand-verified IQR fence', () => {
    // Sorted rates: 1980, 2010, 2054, 2110, 9800 (n=5, >= MIN_SAMPLE_FOR_IQR_TRIM)
    // Q1 (25th pct, linear interp, rank=0.25*4=1) = 2010
    // Q3 (75th pct, rank=0.75*4=3) = 2110
    // IQR = 100; fence = [2010 - 150, 2110 + 150] = [1860, 2260]
    const rates = [1980, 2010, 2054, 2110, 9800];
    const comps = rates.map((r) => comp(r));

    const result = classifyComparablesForMedian(comps);

    expect(result.eligible).toHaveLength(4);
    expect(result.eligible.map((c) => c.adjusted_rate_per_sqm)).toEqual([1980, 2010, 2054, 2110]);
    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0].item.adjusted_rate_per_sqm).toBe(9800);
    expect(result.quarantined[0].reason).toContain('Statistical outlier');
    expect(result.quarantined[0].reason).toContain('$1,860');
    expect(result.quarantined[0].reason).toContain('$2,260');
  });

  it('skips statistical trimming when the rated sample is below the minimum (n < 4)', () => {
    // Only 3 rated comparables — even a wild outlier must not be flagged.
    const comps = [comp(1000), comp(1100), comp(50000)];
    const result = classifyComparablesForMedian(comps);

    expect(result.eligible).toHaveLength(3);
    expect(result.quarantined).toEqual([]);
  });

  it('skips statistical trimming when IQR is zero (degenerate fence)', () => {
    // All rates identical -> Q1 = Q3 = 2000 -> IQR = 0 -> trimming skipped entirely, even though
    // a naive zero-width fence would otherwise flag every row as an "outlier".
    const allIdentical = [comp(2000), comp(2000), comp(2000), comp(2000)];
    const result = classifyComparablesForMedian(allIdentical);

    expect(result.eligible).toHaveLength(4);
    expect(result.quarantined).toEqual([]);
  });

  it('quarantines a comparable that is both part-interest AND numerically extreme exactly once, in the part-interest bucket', () => {
    const partialAndExtreme = comp(50000, 50);
    const normalComps = [comp(2000), comp(2100), comp(1950), comp(2050)];
    const result = classifyComparablesForMedian([partialAndExtreme, ...normalComps]);

    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0].item).toBe(partialAndExtreme);
    expect(result.quarantined[0].reason).toContain('Part-interest sale');
    expect(result.eligible).toHaveLength(4);
  });

  it('catches a "manually-entered" comparable independent of any generation-time gate', () => {
    // Simulates a comparable added via the manual create() endpoint, which never runs through
    // computeAdjustedFields' gates at all — this function is the only stage that sees every
    // comparable regardless of entry path.
    const manuallyEntered: QuarantinableComparable = { adjusted_rate_per_sqm: 2000, interest_of_sale_percent: 50 };
    const result = classifyComparablesForMedian([manuallyEntered]);

    expect(result.eligible).toEqual([]);
    expect(result.quarantined).toHaveLength(1);
  });

  it('comparables with no usable rate are eligible but contribute nothing to outlier detection', () => {
    const noRate = comp(null);
    const rated = [comp(2000), comp(2100), comp(1950), comp(2050)];
    const result = classifyComparablesForMedian([noRate, ...rated]);

    expect(result.eligible).toContain(noRate);
    expect(result.eligible).toHaveLength(5);
    expect(result.quarantined).toEqual([]);
  });
});
