/**
 * Canonical "is this a vacant-land sale" predicate — matches the criteria comparables.prompts.ts
 * already states to the LLM ("nature_of_property = 'V' OR primary_purpose contains 'VACANT'").
 * Exported so every vacant-related decision in this pipeline (SQL priority ordering, the
 * reserved vacant floor below, dedupeByDealingNumber's tiebreak) agrees on the same definition.
 */
export function isVacantLandRow(row: Record<string, unknown>): boolean {
  const natureOfProperty = String(row.nature_of_property ?? '').trim().toUpperCase();
  const primaryPurpose = String(row.primary_purpose ?? '').trim().toUpperCase();
  return natureOfProperty === 'V' || primaryPurpose.includes('VACANT');
}

/**
 * Round-robins across time buckets (tagged via a `time_bucket` property, e.g. from a SQL
 * NTILE() window function) instead of taking a plain prefix, so trimming a stratified fetch
 * down to a smaller final cap never re-collapses it back into "the most recent N" — the exact
 * failure mode a naive `.slice(0, cap)` on a bucket-ordered result set would hit.
 */
export function selectTimeDiverseSubset(
  rows: Record<string, unknown>[],
  cap: number,
): Record<string, unknown>[] {
  if (rows.length <= cap) return rows;

  const byBucket = new Map<unknown, Record<string, unknown>[]>();
  for (const row of rows) {
    const bucket = row.time_bucket;
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket)!.push(row);
  }
  const buckets = [...byBucket.values()]; // each already ordered best-first by the SQL query

  const result: Record<string, unknown>[] = [];
  let i = 0;
  while (result.length < cap && buckets.some((b) => b.length > 0)) {
    const bucket = buckets[i % buckets.length];
    if (bucket.length > 0) result.push(bucket.shift()!);
    i++;
  }
  return result;
}

/**
 * Same round-robin time-diverse selection as selectTimeDiverseSubset, but first reserves up to
 * `vacantFloor` vacant-land rows (chosen time-diversely among themselves) before filling the
 * rest of `target` normally. The floor is carved OUT of `target`, not added on top, so callers'
 * total budget math (MAX_CANDIDATE_SALES, TIER1_TARGET, etc.) is unaffected. This is the
 * dedicated mechanism ensuring vacant sales — which need no improvement deduction and are the
 * strongest evidence per the NSW screening guide — get real priority instead of being crowded
 * out purely by improved-sale volume within the same time bucket. `vacantFloor = 0` reproduces
 * the old behavior exactly.
 */
export function selectTimeDiverseSubsetWithVacantFloor(
  rows: Record<string, unknown>[],
  target: number,
  vacantFloor: number,
): Record<string, unknown>[] {
  if (rows.length <= target) return rows;

  const vacantRows = rows.filter(isVacantLandRow);
  const reservedVacant = selectTimeDiverseSubset(
    vacantRows,
    Math.min(vacantFloor, vacantRows.length, target),
  );
  const reservedSet = new Set(reservedVacant);
  const remaining = rows.filter((r) => !reservedSet.has(r));
  const remainingTarget = Math.max(0, target - reservedVacant.length);

  return [...reservedVacant, ...selectTimeDiverseSubset(remaining, remainingTarget)];
}

/**
 * Tags each row with its originating SQL tier and dedups by row id (first-tier-wins),
 * preserving tier priority (tier 1 > 2 > 3).
 */
export function mergeById(
  ...tierGroups: { tier: number; rows: Record<string, unknown>[] }[]
): Record<string, unknown>[] {
  const seen = new Set<unknown>();
  const merged: Record<string, unknown>[] = [];
  for (const { tier, rows } of tierGroups) {
    for (const row of rows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        merged.push({ ...row, _tier: tier });
      }
    }
  }
  return merged;
}

/**
 * Dedups by dealing_number — one record per real-world transaction, preferring whole-interest
 * over partial-interest, then vacant over improved, then larger area (most representative lot).
 * NSW sales data records each lot in a multi-lot sale separately; without this, a single
 * subdivision deal can appear N times. Whole-interest is checked first because a partial-interest
 * sibling will be hard-excluded downstream anyway (comparables.service.ts's
 * filterPartialInterestSales) — no point keeping it over a fine whole-interest sibling.
 */
export function dedupeByDealingNumber(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const getRowArea = (r: Record<string, unknown>) => Number(r.area ?? 0);
  const isWholeInterest = (r: Record<string, unknown>) => {
    const pct = r.interest_of_sale_percent;
    return pct == null || Number(pct) === 0;
  };

  const byDealing = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = String(row.dealing_number ?? row.id);
    const existing = byDealing.get(key);
    if (!existing) {
      byDealing.set(key, row);
      continue;
    }
    const rowIsBetter =
      (!isWholeInterest(existing) && isWholeInterest(row)) ||
      (isWholeInterest(existing) === isWholeInterest(row) &&
        !isVacantLandRow(existing) && isVacantLandRow(row)) ||
      (isWholeInterest(existing) === isWholeInterest(row) &&
        isVacantLandRow(existing) === isVacantLandRow(row) &&
        getRowArea(row) > getRowArea(existing));
    if (rowIsBetter) byDealing.set(key, row);
  }
  return [...byDealing.values()];
}

export function stripInternalFields(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map((r) => {
    const { _tier, time_bucket, ...rest } = r;
    return rest;
  });
}

/**
 * Combines per-tier stratified pools into the final candidate list, guaranteeing tier 2/3
 * floors when supply allows, and waterfalling unused budget back to higher-priority tiers
 * (1 > 2 > 3) rather than wasting it when a tier is thin — e.g. a rural suburb with fewer
 * tier-1 sales than its target lets tier 2/3 fill the rest of the total budget.
 */
export function assembleTieredCandidates(
  tier1Rows: Record<string, unknown>[],
  tier2Rows: Record<string, unknown>[],
  tier3Rows: Record<string, unknown>[],
  opts: {
    total: number;
    tier1Target: number;
    tier2Floor: number;
    tier3Floor: number;
    tier1VacantFloor?: number;
    tier2VacantFloor?: number;
    tier3VacantFloor?: number;
  },
): Record<string, unknown>[] {
  let picked1 = selectTimeDiverseSubsetWithVacantFloor(tier1Rows, opts.tier1Target, opts.tier1VacantFloor ?? 0);
  let picked2 = selectTimeDiverseSubsetWithVacantFloor(tier2Rows, opts.tier2Floor, opts.tier2VacantFloor ?? 0);
  let picked3 = selectTimeDiverseSubsetWithVacantFloor(tier3Rows, opts.tier3Floor, opts.tier3VacantFloor ?? 0);

  let leftover = opts.total - (picked1.length + picked2.length + picked3.length);

  if (leftover > 0) {
    const picked1Set = new Set(picked1);
    const remaining1 = tier1Rows.filter((r) => !picked1Set.has(r));
    const extra1 = selectTimeDiverseSubset(remaining1, leftover);
    picked1 = [...picked1, ...extra1];
    leftover -= extra1.length;
  }
  if (leftover > 0) {
    const picked2Set = new Set(picked2);
    const remaining2 = tier2Rows.filter((r) => !picked2Set.has(r));
    const extra2 = selectTimeDiverseSubset(remaining2, leftover);
    picked2 = [...picked2, ...extra2];
    leftover -= extra2.length;
  }
  if (leftover > 0) {
    const picked3Set = new Set(picked3);
    const remaining3 = tier3Rows.filter((r) => !picked3Set.has(r));
    const extra3 = selectTimeDiverseSubset(remaining3, leftover);
    picked3 = [...picked3, ...extra3];
  }

  return stripInternalFields([...picked1, ...picked2, ...picked3]);
}
