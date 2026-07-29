import {
  selectTimeDiverseSubset,
  selectTimeDiverseSubsetWithVacantFloor,
  mergeById,
  dedupeByDealingNumber,
  stripInternalFields,
  assembleTieredCandidates,
  isVacantLandRow,
} from './candidate-stratification.util';

function row(id: number, bucket: number, extra: Record<string, unknown> = {}) {
  return { id, time_bucket: bucket, ...extra };
}

function vacantRow(id: number, bucket: number, extra: Record<string, unknown> = {}) {
  return row(id, bucket, { nature_of_property: 'V', ...extra });
}

describe('isVacantLandRow', () => {
  it('returns true when nature_of_property is exactly "V"', () => {
    expect(isVacantLandRow({ nature_of_property: 'V', primary_purpose: 'RESIDENCE' })).toBe(true);
  });

  it('returns true when primary_purpose contains VACANT (case-insensitive), regardless of nature_of_property', () => {
    expect(isVacantLandRow({ nature_of_property: 'R', primary_purpose: 'vacant land' })).toBe(true);
    expect(isVacantLandRow({ nature_of_property: 'R', primary_purpose: 'VACANT LAND' })).toBe(true);
  });

  it('returns false for an ordinary improved sale', () => {
    expect(isVacantLandRow({ nature_of_property: 'R', primary_purpose: 'RESIDENCE' })).toBe(false);
  });

  it('handles missing fields without throwing', () => {
    expect(isVacantLandRow({})).toBe(false);
  });
});

describe('selectTimeDiverseSubset', () => {
  it('returns all rows unchanged when cap >= rows.length', () => {
    const rows = [row(1, 1), row(2, 2)];
    expect(selectTimeDiverseSubset(rows, 5)).toEqual(rows);
  });

  it('round-robins across buckets instead of taking a prefix', () => {
    // Bucket 1 has 5 rows (would fill the whole cap if taken as a prefix), buckets 2-5 have 1 each.
    const rows = [
      row(1, 1), row(2, 1), row(3, 1), row(4, 1), row(5, 1),
      row(6, 2), row(7, 3), row(8, 4), row(9, 5),
    ];
    const result = selectTimeDiverseSubset(rows, 5);
    expect(result).toHaveLength(5);
    const buckets = new Set(result.map((r) => r.time_bucket));
    // A naive prefix slice would only include bucket 1; round-robin should span multiple buckets.
    expect(buckets.size).toBeGreaterThan(1);
    expect(buckets.has(2)).toBe(true);
    expect(buckets.has(5)).toBe(true);
  });

  it('handles empty input without erroring', () => {
    expect(selectTimeDiverseSubset([], 10)).toEqual([]);
  });

  it('handles unevenly sized buckets without erroring or losing rows below the cap', () => {
    const rows = [row(1, 1), row(2, 1), row(3, 1), row(4, 2)];
    const result = selectTimeDiverseSubset(rows, 3);
    expect(result).toHaveLength(3);
  });
});

describe('mergeById', () => {
  it('tags rows with their originating tier', () => {
    const result = mergeById(
      { tier: 1, rows: [row(1, 1)] },
      { tier: 2, rows: [row(2, 1)] },
    );
    expect(result).toEqual([
      { id: 1, time_bucket: 1, _tier: 1 },
      { id: 2, time_bucket: 1, _tier: 2 },
    ]);
  });

  it('dedups by id, first-tier-wins', () => {
    const result = mergeById(
      { tier: 1, rows: [row(1, 1, { area: 'from-tier-1' })] },
      { tier: 2, rows: [row(1, 1, { area: 'from-tier-2' })] },
    );
    expect(result).toHaveLength(1);
    expect(result[0]._tier).toBe(1);
    expect(result[0].area).toBe('from-tier-1');
  });
});

describe('dedupeByDealingNumber', () => {
  it('prefers a vacant row over an improved row with the same dealing_number', () => {
    const improved = { id: 1, dealing_number: 'D1', nature_of_property: 'R', area: 500 };
    const vacant = { id: 2, dealing_number: 'D1', nature_of_property: 'V', area: 400 };
    const result = dedupeByDealingNumber([improved, vacant]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('prefers the larger-area row when vacant status is the same', () => {
    const smaller = { id: 1, dealing_number: 'D1', nature_of_property: 'R', area: 300 };
    const larger = { id: 2, dealing_number: 'D1', nature_of_property: 'R', area: 800 };
    const result = dedupeByDealingNumber([smaller, larger]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('falls back to row id when dealing_number is missing', () => {
    const a = { id: 1, area: 300 };
    const b = { id: 2, area: 300 };
    expect(dedupeByDealingNumber([a, b])).toHaveLength(2);
  });

  it('prefers a whole-interest row over a partial-interest sibling, even when the partial one is vacant and larger', () => {
    const wholeInterest = { id: 1, dealing_number: 'D1', nature_of_property: 'R', area: 300, interest_of_sale_percent: 0 };
    const partialInterestVacant = { id: 2, dealing_number: 'D1', nature_of_property: 'V', area: 800, interest_of_sale_percent: 50 };
    const result = dedupeByDealingNumber([wholeInterest, partialInterestVacant]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });
});

describe('selectTimeDiverseSubsetWithVacantFloor', () => {
  it('reserves the vacant floor even when non-vacant rows would otherwise fill the whole target via recency ordering', () => {
    const nonVacant = Array.from({ length: 20 }, (_, i) => row(i, i % 5));
    const vacant = [vacantRow(100, 1), vacantRow(101, 2)];
    const rows = [...nonVacant, ...vacant];

    const result = selectTimeDiverseSubsetWithVacantFloor(rows, 10, 2);
    expect(result).toHaveLength(10);
    const vacantSurvivors = result.filter((r) => isVacantLandRow(r));
    expect(vacantSurvivors).toHaveLength(2);
  });

  it('does not pad with non-vacant rows when vacant supply is below the floor', () => {
    const nonVacant = Array.from({ length: 20 }, (_, i) => row(i, i % 5));
    const vacant = [vacantRow(100, 1)]; // only 1 vacant row, floor asks for 4
    const rows = [...nonVacant, ...vacant];

    const result = selectTimeDiverseSubsetWithVacantFloor(rows, 10, 4);
    expect(result).toHaveLength(10);
    const vacantSurvivors = result.filter((r) => isVacantLandRow(r));
    expect(vacantSurvivors).toHaveLength(1); // can't reserve more than exists
  });

  it('vacantFloor=0 reproduces selectTimeDiverseSubset exactly', () => {
    const rows = [
      row(1, 1), row(2, 1), row(3, 1), row(4, 1), row(5, 1),
      row(6, 2), row(7, 3), row(8, 4), row(9, 5),
    ];
    expect(selectTimeDiverseSubsetWithVacantFloor(rows, 5, 0)).toEqual(selectTimeDiverseSubset(rows, 5));
  });

  it('returns all rows unchanged when rows.length <= target, regardless of vacantFloor', () => {
    const rows = [row(1, 1), vacantRow(2, 2)];
    expect(selectTimeDiverseSubsetWithVacantFloor(rows, 5, 3)).toEqual(rows);
  });
});

describe('stripInternalFields', () => {
  it('removes _tier and time_bucket but keeps other fields', () => {
    const result = stripInternalFields([{ id: 1, _tier: 1, time_bucket: 2, area: 500 }]);
    expect(result).toEqual([{ id: 1, area: 500 }]);
  });
});

describe('assembleTieredCandidates', () => {
  const opts = { total: 30, tier1Target: 18, tier2Floor: 6, tier3Floor: 6 };

  it('respects tier floors when every tier has ample supply', () => {
    const tier1 = Array.from({ length: 50 }, (_, i) => row(i, i % 5));
    const tier2 = Array.from({ length: 50 }, (_, i) => row(1000 + i, i % 5));
    const tier3 = Array.from({ length: 50 }, (_, i) => row(2000 + i, i % 5));

    const result = assembleTieredCandidates(tier1, tier2, tier3, opts);
    expect(result).toHaveLength(30);

    const tier2Ids = new Set<unknown>(tier2.map((r) => r.id));
    const tier3Ids = new Set<unknown>(tier3.map((r) => r.id));
    const tier2Survivors = result.filter((r) => tier2Ids.has(r.id));
    const tier3Survivors = result.filter((r) => tier3Ids.has(r.id));
    // Tiers 2 and 3 must never be crowded to zero when they have supply — this is the bug being fixed.
    expect(tier2Survivors.length).toBeGreaterThanOrEqual(opts.tier2Floor);
    expect(tier3Survivors.length).toBeGreaterThanOrEqual(opts.tier3Floor);
  });

  it('waterfalls unused budget from a thin tier 1 to tiers 2/3 (rural case)', () => {
    const tier1 = [row(1, 1)]; // thin same-suburb supply
    const tier2 = Array.from({ length: 50 }, (_, i) => row(1000 + i, i % 5));
    const tier3 = Array.from({ length: 50 }, (_, i) => row(2000 + i, i % 5));

    const result = assembleTieredCandidates(tier1, tier2, tier3, opts);
    // Total pool should still reach the full budget, not shrink because tier 1 was thin.
    expect(result).toHaveLength(30);
  });

  it('returns fewer than total when every tier is thin, without erroring', () => {
    const result = assembleTieredCandidates([row(1, 1)], [row(2, 1)], [row(3, 1)], opts);
    expect(result).toHaveLength(3);
  });

  it('strips internal fields from the final output', () => {
    const result = assembleTieredCandidates([row(1, 1)], [], [], opts);
    expect(result[0]).not.toHaveProperty('_tier');
    expect(result[0]).not.toHaveProperty('time_bucket');
  });

  it('respects vacant floors when tiers are overwhelmingly non-vacant', () => {
    const tier1 = [
      ...Array.from({ length: 50 }, (_, i) => row(i, i % 5)),
      ...Array.from({ length: 3 }, (_, i) => vacantRow(500 + i, i % 5)),
    ];
    const tier2 = Array.from({ length: 50 }, (_, i) => row(1000 + i, i % 5));
    const tier3 = Array.from({ length: 50 }, (_, i) => row(2000 + i, i % 5));

    const result = assembleTieredCandidates(tier1, tier2, tier3, {
      ...opts,
      tier1VacantFloor: 3,
    });

    const vacantSurvivors = result.filter((r) => isVacantLandRow(r));
    expect(vacantSurvivors.length).toBeGreaterThanOrEqual(3);
  });

  it('vacant floors default to 0 when omitted (backward-compatible)', () => {
    const tier1 = Array.from({ length: 50 }, (_, i) => row(i, i % 5));
    const result = assembleTieredCandidates(tier1, [], [], { total: 10, tier1Target: 10, tier2Floor: 0, tier3Floor: 0 });
    expect(result).toHaveLength(10);
  });
});
