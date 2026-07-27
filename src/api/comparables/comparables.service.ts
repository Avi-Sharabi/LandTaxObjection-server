import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { APIError } from '@anthropic-ai/sdk';
import { ComparableSale } from './entities/comparable-sale.entity';
import { NswLocalityCentroid } from './entities/nsw-locality-centroid.entity';
import { GeocodingService } from '../supporting-evidence/shared/geocoding.service';
import { haversineDistanceKm } from '../../common/utils/geo-distance.util';
import { AnthropicService, ANTHROPIC_MODEL } from 'src/ai/anthropic.service';
import { CreateComparableDto } from './dto/create-comparable.dto';
import { ComparableResponseDto } from './dto/comparable-response.dto';
import { GenerateComparableSalesDto } from './dto/generate-comparable-sales.dto';
import { FutureSaleDateException } from './exceptions/future-sale-date.exception';
import {
  InsufficientComparablesException,
  MINIMUM_COMPARABLES,
} from './exceptions/insufficient-comparables.exception';
import { DisputeCaseNotFoundException } from './exceptions/dispute-case-not-found.exception';
import { LlmTruncationException } from './exceptions/llm-truncation.exception';
import { LlmToolUseException } from './exceptions/llm-tool-use.exception';
import { LlmParseException } from './exceptions/llm-parse.exception';
import { LlmApiException } from './exceptions/llm-api.exception';
import { MissingValuationDateException } from './exceptions/missing-valuation-date.exception';
import { MissingLandAreaException } from './exceptions/missing-land-area.exception';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { SkillRegistryService } from '../../mcp/skill-registry.service';
import { buildUserPrompt, SubjectContext } from './comparables.prompts';
import { zoningFamily } from './zoning.util';
import {
  mergeById,
  dedupeByDealingNumber,
  assembleTieredCandidates,
  selectTimeDiverseSubsetWithVacantFloor,
  stripInternalFields,
  isVacantLandRow,
} from './candidate-stratification.util';
import { stripTrailingPostcode } from '../../common/utils/address-parser.util';


// Raised from 20 — a flat cap combined with each tier's own `ORDER BY contract_date DESC
// LIMIT N` meant the candidate pool was always "the N most recent same-suburb sales", never a
// representative sample of the 5-year lookback window (verified against the real dev DB: in
// 12-13/15 sampled cases, Tier 1 alone already exceeded the old cap, so Tiers 2/3 contributed
// nothing, and even Tier 1's own contribution excluded older-but-valid sales). 30 funds
// TIER1_TARGET + TIER2_FLOOR + TIER3_FLOOR below with headroom for the cross-tier waterfall,
// at a modest ~1000-token prompt cost (well within the existing 32000 max_tokens budget, which
// is an output-token ceiling unaffected by input growth).
const MAX_CANDIDATE_SALES = 30;

// Quintiles of each tier's eligible row set (by recency rank within the already-filtered rows,
// not fixed calendar time) — spreads the candidate pool across the whole lookback window
// instead of just its newest slice. NTILE degrades gracefully with sparse data (no empty
// buckets), unlike fixed calendar buckets.
const TIME_STRATIFICATION_BUCKETS = 5;

// Per-tier allocation of the MAX_CANDIDATE_SALES budget — floors guarantee Tier 2/3 ("nearby
// suburb" evidence the LLM prompt's SELECTION CRITERIA tiers 4-6 expect) are never crowded to
// zero by Tier 1's volume, while Tier 1 keeps priority (same suburb is the strongest evidence).
// Unused budget from a thin tier waterfalls to the next-priority tier in assembleTieredCandidates.
const TIER1_TARGET = 18;
const TIER2_FLOOR = 6;
const TIER3_FLOOR = 6;

// Reserved-within-tier floor for vacant-land rows — carved OUT of each tier's own target/floor
// above (not added on top), so MAX_CANDIDATE_SALES stays the hard cap. Vacant sales need no
// improvement deduction and are the strongest evidence, but a flat recency-ordered selection can
// crowd them out purely by improved-sale volume within the same time bucket.
const TIER1_VACANT_FLOOR = 4;
const TIER2_VACANT_FLOOR = 2;
const TIER3_VACANT_FLOOR = 2;
const BROAD_VACANT_FLOOR = 4; // round 2/3's single-pool equivalent (prefetchBroadCandidateSales)

// SQL-side per-bucket caps — sized so bucket-count x cap reproduces each tier's old total LIMIT
// (120/80/60/80), preserving DB scan volume; the diversity comes from *how* NTILE selects
// within that ceiling, not from raising it.
const TIER1_SQL_PER_BUCKET_CAP = 24; // 5 x 24 = 120 (was LIMIT 120)
const TIER2_SQL_PER_BUCKET_CAP = 16; // 5 x 16 = 80  (was LIMIT 80)
const TIER3_SQL_PER_BUCKET_CAP = 12; // 5 x 12 = 60  (was LIMIT 60)
const BROAD_SQL_PER_BUCKET_CAP = 16; // 5 x 16 = 80  (was LIMIT 80)

// Real-distance gate applied after the postcode-prefix SQL pre-filter — NSW postcode
// prefixes are not geographically contiguous (e.g. "203" spans both the eastern suburbs
// and the inner west), so the SQL tiers alone are not sufficient to guarantee proximity.
// Round 2 uses a wider radius since it only runs when Round 1 found too few candidates.
const ROUND1_MAX_KM = 3;
const ROUND2_MAX_KM = 8;
// Last-resort widening — wider distance AND a longer lookback window than rounds 1-2. Only
// fires if round 2 still leaves the combined total short of TARGET_COMPARABLES.
const ROUND3_MAX_KM = 15;
const ROUND3_LOOKBACK_YEARS = 7;

// Hard cap on widening rounds (round 1 suburb-tiered, round 2 broadened postcode-prefix,
// round 3 broadened + longer lookback) — generation never widens indefinitely.
const MAX_ROUNDS = 3;

// Aspirational target distinct from MINIMUM_COMPARABLES (the hard floor that gates whether a
// case can progress at all, imported below) — rounds keep widening (up to MAX_ROUNDS) while the
// combined auto-included + LLM-supporting total is below this, but there's no requirement to
// hit it; if still short after MAX_ROUNDS, that's logged as a real finding, not papered over.
const TARGET_COMPARABLES = 5;

// Hard ceiling on the final persisted count — unlike TARGET_COMPARABLES (a lower-bound "keep
// widening" trigger), this is an upper bound with real teeth. selectByTimeBandPreference
// deliberately never truncates mid-rung once it starts pulling from one (every candidate in a
// rung already passed every hard gate), so a wide round that sweeps in an entire same-rung
// cluster of same-batch sales can otherwise blow past TARGET_COMPARABLES by a lot. The buffer
// over TARGET_COMPARABLES exists to survive later quarantine attrition (part-interest/outlier
// exclusion at report time) without falling back under target — not to accumulate more evidence
// than needed; classifyComparablesForMedian's IQR trimming already activates at n=4, so more
// than this buys little statistically.
const MAX_PERSISTED_COMPARABLES = 8;

// Minimum fraction of the final selected set that must be "ideal" evidence (fresh/recent time
// band AND same-family zoning confidence) for widening to stop early via confidence alone, once
// TARGET_COMPARABLES is already met. Deliberately excludes size_tier — a widened-size-but-fresh
// comparable is already treated as good, deliberately-preferred evidence elsewhere in this file
// (see SIZE_BAND_WIDENED_TOLERANCE_FRACTION below), so penalizing it here would contradict that
// and force unnecessary extra rounds on cases whose best evidence legitimately needs the widened
// size tolerance. Initial default — tune against real cases like every other constant here.
const IDEAL_EVIDENCE_RATIO_THRESHOLD = 0.8;

// ±30% size-band hard gate — a comparable outside this band around the subject's landAreaSqm
// requires extrapolating the size-adjustment curve (sizeFactor = (area/subjectArea)^0.15 in
// computeAdjustedFields) far enough that it's no longer treated as genuine supporting evidence.
const SIZE_BAND_TOLERANCE_FRACTION = 0.3;

// Outer ceiling for the deterministic auto-include path's "widened" size tolerance (see
// classifySizeTier) — a rescue tier for candidates outside SIZE_BAND_TOLERANCE_FRACTION but
// still within this wider band. The whole point: a NSW land tax objection is a claim about value
// at ONE valuation date, so date-proximity is the dimension worth protecting; size already has a
// bounded, symmetric, defensible correction (sizeFactor above), so it's the dimension that should
// flex first, before falling back to a stale (>18mo, 'last_resort') sale. 50% is a principled
// stopping point, not indefinite widening (mirrors MAX_ROUNDS/ROUND3_MAX_KM's "never widen
// indefinitely" philosophy) — beyond it the sizeFactor curve is extrapolating far enough it's no
// longer reliable, same reasoning as SIZE_BAND_TOLERANCE_FRACTION's own ±30% choice, just wider.
// Only used by identifyAutoIncludable/selectByTimeBandPreference — runComparableRound's own
// filterOutsideSizeBand call is untouched and still gates at the strict ±30% band only.
const SIZE_BAND_WIDENED_TOLERANCE_FRACTION = 0.5;

// Ranked last-resort scoring weights (see selectRankedLastResortCandidates) — used only once
// every hard-gated round (including the zoning-family bypass) has already run and the case is
// still under MINIMUM_COMPARABLES. Size and zoning dominate the weighting because those are the
// two dimensions this tier is specifically bypassing the hard gates on; distance/recency remain
// as tiebreakers. Weights are relative, not required to sum to 1.
const RANKED_LAST_RESORT_SIZE_WEIGHT = 0.4;
const RANKED_LAST_RESORT_ZONING_WEIGHT = 0.3;
const RANKED_LAST_RESORT_DISTANCE_WEIGHT = 0.2;
const RANKED_LAST_RESORT_TIME_WEIGHT = 0.1;
// Size deviation (a ratio, e.g. 21.0 for a candidate 21x the subject's area) is the only one of
// the four scoring terms above that isn't naturally bounded to [0,1] — capped here so one
// pathologically extreme candidate can't produce a score so large it makes the logged value
// meaningless. Set well above 1.0 (the ±100%-deviation point) so size still decisively dominates
// the ranking for genuinely extreme subjects (matching the weighting rationale above) — this only
// clamps the truly absurd tail, it doesn't flatten the normal range.
const RANKED_LAST_RESORT_SIZE_DEVIATION_CAP = 3;

// Four-band time treatment replacing the old single 12-month cliff. Thresholds are months
// between contract_date and the subject's valuation date.
const TIME_BAND_FRESH_MAX_MONTHS = 6;     // 0-6mo: use as-is, no adjustment
const TIME_BAND_RECENT_MAX_MONTHS = 12;   // 6-12mo: minor adjustment
const TIME_BAND_ADJUSTED_MAX_MONTHS = 18; // 12-18mo: full adjustment ("adjustment required")
// >18mo: 'last_resort' — same continued per-month rate as the 12-18mo band; the only thing that
// changes for this band is the SELECTION preference below, not the math.
const TIME_ADJUSTMENT_RATE_PER_MONTH = 0.003; // unchanged coefficient from the old single formula
const TIME_BAND_MINOR_ADJUSTMENT_FRACTION = 0.4; // dampens the 6-12mo band's adjustment

// Selection-preference order (freshest first) — see selectByTimeBandPreference. Mirrors the
// existing geographic round-widening principle ("only widen if still short") but applied WITHIN
// a single round's auto-include step, working with the bands computed above.
const TIME_BAND_PRIORITY_ORDER: Array<'fresh' | 'recent' | 'adjusted' | 'last_resort'> =
  ['fresh', 'recent', 'adjusted', 'last_resort'];

type SizeTier = 'preferred' | 'widened' | 'extrapolated';

// Rung order for the deterministic auto-include path ONLY (see classifySizeTier and
// selectByTimeBandPreference). Walks every 'preferred' (±30%) time band first —
// fresh/recent/adjusted (0-18mo) are already treated uniformly by computeAdjustedFields as
// genuine, includable evidence, differing only in adjustment magnitude, not eligibility — before
// ever reaching the 'widened' (30%-50%) tier, and only reaches 'last_resort' (>18mo) at the
// strict ±30% band. 'last_resort' never pairs with 'widened' here: a stale-AND-oversized
// comparable isn't better evidence just because it exists — compounding a size extrapolation with
// a date extrapolation is exactly what this ladder is designed to avoid.
const SELECTION_RUNGS: Array<{ timeBand: typeof TIME_BAND_PRIORITY_ORDER[number]; sizeTier: SizeTier }> = [
  ...TIME_BAND_PRIORITY_ORDER.filter((b) => b !== 'last_resort').map((timeBand) => ({ timeBand, sizeTier: 'preferred' as const })),
  ...TIME_BAND_PRIORITY_ORDER.filter((b) => b !== 'last_resort').map((timeBand) => ({ timeBand, sizeTier: 'widened' as const })),
  { timeBand: 'last_resort' as const, sizeTier: 'preferred' as const },
  // 'extrapolated' — ranked-last-resort candidates outside even the widened ±50% band (see
  // selectRankedLastResortCandidates) — sits dead last across every time band, including
  // last_resort. Unlike the widened tier's deliberate exclusion of last_resort above, compounding
  // "stale" with "extrapolated" here is acceptable: this rung only ever gets consulted once every
  // rung above has already failed to fill the case to MINIMUM_COMPARABLES, so there is no better
  // evidence being displaced by including it.
  ...TIME_BAND_PRIORITY_ORDER.map((timeBand) => ({ timeBand, sizeTier: 'extrapolated' as const })),
];

// 'insufficient': below MINIMUM_COMPARABLES regardless of quality — a hard-floor breach, distinct
// from mediocre-but-sufficient evidence. 'strong': at/above TARGET_COMPARABLES AND idealRatio
// clears IDEAL_EVIDENCE_RATIO_THRESHOLD. 'adequate': everything else (count met but weak quality,
// or between the minimum and target counts).
type EvidenceConfidence = { tier: 'strong' | 'adequate' | 'insufficient'; idealRatio: number; count: number };


@Injectable()
export class ComparablesService implements OnModuleInit {
  private readonly logger = new Logger(ComparablesService.name);
  private skillContent = '';
  private schemaBlock = '';
  private centroidCache = new Map<string, { lat: number; lng: number }>();

  constructor(
    @InjectRepository(ComparableSale)
    private readonly comparablesRepository: Repository<ComparableSale>,
    @InjectRepository(DisputeCase)
    private readonly disputeCasesRepository: Repository<DisputeCase>,
    @InjectRepository(NswLocalityCentroid)
    private readonly centroidsRepository: Repository<NswLocalityCentroid>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly skillRegistry: SkillRegistryService,
    private readonly anthropic: AnthropicService,
    private readonly geocoding: GeocodingService,
  ) { }

  private logEvent(context: string, data: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ context, ...data, ts: new Date().toISOString() }));
  }

  async onModuleInit(): Promise<void> {
    this.skillContent = this.skillRegistry.getSkillContent('nsw-land-tax-comparables');

    const schemaRows: { column_name: string; data_type: string; is_nullable: string }[] =
      await this.dataSource.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'property_sales_raw'
         ORDER BY ordinal_position`,
      );
    this.schemaBlock = schemaRows
      .map((r) => `  ${r.column_name} (${r.data_type}${r.is_nullable === 'YES' ? ', nullable' : ''})`)
      .join('\n');
    this.logger.log(`[INIT] Skill loaded (${this.skillContent.length} chars), schema loaded (${schemaRows.length} columns)`);

    try {
      const centroids = await this.centroidsRepository.find();
      for (const c of centroids) {
        this.centroidCache.set(c.locality, { lat: Number(c.lat), lng: Number(c.lng) });
      }
      this.logger.log(`[INIT] Loaded ${centroids.length} NSW locality centroids`);
    } catch (err) {
      this.logger.warn(`[INIT] Failed to load locality centroids: ${(err as Error).message}`);
    }
  }

  /**
   * Resolves a lat/lng centroid for a locality name, backed by the nsw_locality_centroids
   * cache and falling back to a live geocode (persisted for next time) on a cache miss.
   * Returns null (rather than a guessed value) when the locality cannot be resolved at all —
   * callers must treat that as "unknown distance", never as "nearby".
   */
  private async resolveCentroid(
    locality: string | null | undefined,
    correlationId?: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const key = (locality ?? '').trim().toUpperCase();
    if (!key) return null;

    const cached = this.centroidCache.get(key);
    if (cached) return cached;

    try {
      const coords = await this.geocoding.geocode(`${key}, NSW, Australia`);
      this.centroidCache.set(key, coords);
      this.centroidsRepository
        .upsert({ locality: key, lat: coords.lat, lng: coords.lng, source: 'arcgis', geocoded_at: new Date() }, ['locality'])
        .catch((err) => this.logger.warn(`[GENERATE] Failed to persist centroid for "${key}": ${(err as Error).message}`));
      return coords;
    } catch (err) {
      this.logEvent('GENERATE.centroid_unresolved', { correlationId, locality: key, error: (err as Error).message });
      return null;
    }
  }

  private async resolveSubjectCentroid(
    subject: SubjectContext,
    correlationId?: string,
  ): Promise<{ lat: number; lng: number } | null> {
    if (subject.lat != null && subject.lng != null) {
      return { lat: subject.lat, lng: subject.lng };
    }
    return this.resolveCentroid(subject.suburb, correlationId);
  }

  /**
   * Cross-round hard exclusion — dedupeByDealingNumber (candidate-stratification.util.ts) only
   * dedupes WITHIN a single prefetch call's own result set; it can't see a sale already considered
   * by an earlier round. A multi-lot dealing (one real transaction, several property_sales_raw
   * ids) could otherwise have one sibling survive round 1's dedup alone, while a DIFFERENT sibling
   * gets freshly fetched by a later, more broadly-scoped round — seenPoolIds alone doesn't catch
   * this since it only excludes the specific id already seen, not the underlying transaction. Runs
   * before filterByDistance so a would-be duplicate never reaches the LLM prompt or auto-include.
   */
  private excludeSeenDealingNumbers(
    candidates: Record<string, unknown>[],
    seenDealingNumbers: Set<string>,
    correlationId?: string,
  ): Record<string, unknown>[] {
    const kept: Record<string, unknown>[] = [];
    let dropped = 0;
    for (const candidate of candidates) {
      const key = String(candidate.dealing_number ?? candidate.id);
      if (seenDealingNumbers.has(key)) { dropped++; continue; }
      seenDealingNumbers.add(key);
      kept.push(candidate);
    }
    this.logEvent('GENERATE.dealing_number_dedup', { correlationId, input: candidates.length, kept: kept.length, dropped });
    return kept;
  }

  /**
   * Hard geographic gate — drops any candidate whose locality centroid can't be resolved,
   * or is beyond maxKm from the subject. This runs before candidates ever reach the LLM
   * prompt, so bad-geography rows are excluded rather than relying on the model to notice.
   */
  private async filterByDistance(
    candidates: Record<string, unknown>[],
    subjectCentroid: { lat: number; lng: number } | null,
    maxKm: number,
    correlationId?: string,
  ): Promise<Record<string, unknown>[]> {
    if (!subjectCentroid) {
      this.logger.warn('[GENERATE] Subject centroid could not be resolved — skipping distance gate for this round');
      return candidates;
    }

    const kept: Record<string, unknown>[] = [];
    let droppedTooFar = 0;
    let droppedUnresolved = 0;
    for (const candidate of candidates) {
      const centroid = await this.resolveCentroid(candidate.property_locality as string, correlationId);
      if (!centroid) {
        droppedUnresolved++;
        continue;
      }
      const distanceKm = haversineDistanceKm(subjectCentroid.lat, subjectCentroid.lng, centroid.lat, centroid.lng);
      if (distanceKm > maxKm) {
        droppedTooFar++;
        continue;
      }
      kept.push({ ...candidate, _distanceKm: distanceKm });
    }

    this.logEvent('GENERATE.distance_filter', {
      correlationId,
      maxKm,
      input: candidates.length,
      kept: kept.length,
      droppedTooFar,
      droppedUnresolved,
    });
    return kept;
  }

  /**
   * Hard gate — drops any LLM-selected candidate dated after the subject's valuation date.
   * A sale that occurred after the base date can't be reliably adjusted back to it, so it
   * must never reach the persisted comparable set even if Claude sourced it via the
   * search_comparable_sales MCP tool (bypassing the SQL pre-filter's date bound).
   */
  private filterFutureDatedCandidates(
    candidates: Record<string, unknown>[],
    subject: SubjectContext,
    correlationId?: string,
  ): Record<string, unknown>[] {
    const valuationDate = new Date(subject.valuationDate);
    if (isNaN(valuationDate.getTime())) return candidates;

    const kept: Record<string, unknown>[] = [];
    let dropped = 0;
    for (const candidate of candidates) {
      const contractDate = candidate.contract_date ? new Date(candidate.contract_date as string) : null;
      if (contractDate && !isNaN(contractDate.getTime()) && contractDate > valuationDate) {
        dropped++;
        continue;
      }
      kept.push(candidate);
    }

    this.logEvent('GENERATE.future_date_filter', { correlationId, input: candidates.length, kept: kept.length, dropped });
    return kept;
  }

  /**
   * Hard gate — drops any LLM-selected candidate whose zoning family differs from the
   * subject's (e.g. Residential vs Rural). Per the comparable-selection screening guide, a
   * different permitted use/zoning is not comparable at all, so this must not depend on the
   * LLM's own judgement (tier 8 "different zoning class" candidates are already excluded from
   * the SQL pre-fetch; this also catches anything sourced via the MCP tool).
   */
  private filterDifferentZoningClass(
    candidates: Record<string, unknown>[],
    subject: SubjectContext,
    correlationId?: string,
  ): Record<string, unknown>[] {
    if (subject.zoning === 'unknown') return candidates;
    const subjectFamily = zoningFamily(subject.zoning);

    const kept: Record<string, unknown>[] = [];
    let dropped = 0;
    for (const candidate of candidates) {
      if (!candidate.zoning || zoningFamily(candidate.zoning as string) !== subjectFamily) {
        dropped++;
        continue;
      }
      kept.push(candidate);
    }

    this.logEvent('GENERATE.zoning_class_filter', { correlationId, input: candidates.length, kept: kept.length, dropped });
    return kept;
  }

  /**
   * Fail-closed gate — a "compatible zoning" pick (same family, different exact zoning code
   * to the subject) must carry a non-empty zoning_justification from the LLM explaining why
   * it's still comparable; picks missing one are dropped rather than silently accepted.
   */
  private filterMissingZoningJustification(
    candidates: Record<string, unknown>[],
    subject: SubjectContext,
    correlationId?: string,
  ): Record<string, unknown>[] {
    if (subject.zoning === 'unknown') return candidates;
    const subjectZoning = subject.zoning.trim().toUpperCase();

    const kept: Record<string, unknown>[] = [];
    let dropped = 0;
    for (const candidate of candidates) {
      const candidateZoning = String(candidate.zoning ?? '').trim().toUpperCase();
      // A missing/blank zoning is NOT the same as an exact match — we can't verify compatibility
      // at all without knowing the zoning, which is a stronger reason to exclude than "compatible
      // but needs a written justification." Previously `candidateZoning === ''` made
      // isCompatibleTier false, exempting the least-certain case from this fail-closed check
      // entirely (contradicting this function's own intent) — fixed by dropping it outright here.
      if (candidateZoning === '') {
        dropped++;
        continue;
      }
      const isCompatibleTier = candidateZoning !== subjectZoning;
      const justification = typeof candidate.zoning_justification === 'string' ? candidate.zoning_justification.trim() : '';
      if (isCompatibleTier && !justification) {
        dropped++;
        continue;
      }
      kept.push(candidate);
    }

    this.logEvent('GENERATE.zoning_justification_filter', { correlationId, input: candidates.length, kept: kept.length, dropped });
    return kept;
  }

  /**
   * Hard gate — drops any candidate whose interest_of_sale_percent indicates a fractional/
   * co-ownership interest was sold rather than the whole property. Confirmed empirically against
   * the dev DB: 0 and NULL both mean "full/whole interest sold" — no row anywhere records a
   * literal 100.00, and the observed non-zero values (50, 33, 25, 20, 10, 66/67, 75...) are
   * exactly the set of common ownership-share fractions. A part-interest sale price does not
   * scale linearly to the whole property's value, so it's never valid comparable evidence — same
   * hard-gate treatment as filterDifferentZoningClass/filterFutureDatedCandidates, not a soft
   * LLM tiebreak.
   */
  private filterPartialInterestSales(
    candidates: Record<string, unknown>[],
    correlationId?: string,
  ): Record<string, unknown>[] {
    const kept: Record<string, unknown>[] = [];
    let dropped = 0;
    for (const candidate of candidates) {
      const interestPercent = candidate.interest_of_sale_percent;
      const parsedInterest = interestPercent != null ? Number(interestPercent) : null;
      // A malformed (non-numeric, e.g. a corrupt import value) or negative value is not a
      // documented "whole interest" case — only null/0 are. Previously `Number(x) > 0` was false
      // for both NaN and negative values, so they fell through as if confirmed whole-interest;
      // now both are treated as unverifiable and excluded, same fail-closed direction as a
      // genuine partial-interest sale (matches dedupeByDealingNumber's own, stricter treatment of
      // the same malformed value in candidate-stratification.util.ts, which the two used to
      // disagree on).
      const isUnverifiable = parsedInterest != null && (!Number.isFinite(parsedInterest) || parsedInterest < 0);
      const isPartialInterest = isUnverifiable || (parsedInterest != null && parsedInterest > 0);
      if (isPartialInterest) {
        dropped++;
        continue;
      }
      kept.push(candidate);
    }

    this.logEvent('GENERATE.partial_interest_filter', { correlationId, input: candidates.length, kept: kept.length, dropped });
    return kept;
  }

  /**
   * Hard gate — drops any candidate whose land area falls outside
   * ±SIZE_BAND_TOLERANCE_FRACTION of the subject's landAreaSqm. A comparable requiring heavy
   * extrapolation of the size curve is not treated as genuine supporting evidence — this was
   * previously only a soft LLM tiebreak ("area closest to Xm² preferred"). Applies the same
   * area_type 'H'->sqm conversion computeAdjustedFields uses, so a candidate is never gated on a
   * raw hectare-vs-sqm mismatch. Candidates with no parseable area are passed through (not gated
   * here) — computeAdjustedFields already returns nulls for those, excluded downstream for a
   * different, more specific reason.
   */
  private filterOutsideSizeBand(
    candidates: Record<string, unknown>[],
    subject: SubjectContext,
    correlationId?: string,
  ): Record<string, unknown>[] {
    if (!subject.landAreaSqm) return candidates;

    const kept: Record<string, unknown>[] = [];
    let dropped = 0;
    for (const candidate of candidates) {
      let area = candidate.area != null ? Number(candidate.area) : null;
      if (area == null) {
        kept.push(candidate);
        continue;
      }
      if (candidate.area_type === 'H') area = Math.round(area * 10000);

      const lowerBound = subject.landAreaSqm * (1 - SIZE_BAND_TOLERANCE_FRACTION);
      const upperBound = subject.landAreaSqm * (1 + SIZE_BAND_TOLERANCE_FRACTION);
      if (area < lowerBound || area > upperBound) {
        dropped++;
        continue;
      }
      kept.push(candidate);
    }

    this.logEvent('GENERATE.size_band_filter', {
      correlationId, input: candidates.length, kept: kept.length, dropped,
      toleranceFraction: SIZE_BAND_TOLERANCE_FRACTION,
    });
    return kept;
  }

  /**
   * Three-way size classification for the deterministic auto-include path ONLY — used by
   * identifyAutoIncludable instead of filterOutsideSizeBand's binary keep/drop. Deliberately
   * duplicates filterOutsideSizeBand's ±30% bounds math (~5 lines) rather than reusing it: this
   * guarantees runComparableRound's own filterOutsideSizeBand call (the LLM-facing path) stays
   * completely unaffected by the widened tolerance below. If SIZE_BAND_TOLERANCE_FRACTION ever
   * changes, update both — see the parity test in comparables.service.spec.ts guarding against
   * these two silently disagreeing on the preferred/excluded boundary.
   */
  private classifySizeTier(
    candidate: Record<string, unknown>,
    subject: SubjectContext,
  ): 'preferred' | 'widened' | 'excluded' {
    if (!subject.landAreaSqm) return 'preferred';
    let area = candidate.area != null ? Number(candidate.area) : null;
    if (area == null) return 'preferred';
    if (candidate.area_type === 'H') area = Math.round(area * 10000);

    const within = (fraction: number) =>
      area! >= subject.landAreaSqm! * (1 - fraction) && area! <= subject.landAreaSqm! * (1 + fraction);

    if (within(SIZE_BAND_TOLERANCE_FRACTION)) return 'preferred';
    if (within(SIZE_BAND_WIDENED_TOLERANCE_FRACTION)) return 'widened';
    return 'excluded';
  }

  /**
   * Selection-preference (not a hard gate) — greedily includes auto-includable candidates rung by
   * rung in SELECTION_RUNGS (time-band x size-tier), stopping once `currentTotal + included.length`
   * reaches `target`. A rung that tips the running total over `target` is still included in full —
   * every candidate here already passed every hard gate, so there's no principled reason to
   * truncate a rung mid-way once it's been reached. Every 'preferred'-size fresh/recent/adjusted
   * rung (0-18mo, standard ±30% band) is walked before any 'widened'-size rung is touched, and
   * 'last_resort' (>18mo) is only ever drawn from the 'preferred' size tier — a widened-size
   * candidate that's also stale is never rescued (see SELECTION_RUNGS's doc comment). If every rung
   * is exhausted and the total is still under target (e.g. every available sale is >18 months old),
   * everything qualifying — including 'last_resort' — is returned rather than under-delivering:
   * better to surface older, adjusted evidence than to silently return nothing.
   *
   * Candidates without an explicit `size_tier` (e.g. any caller/fixture that predates this ladder)
   * default to 'preferred', reproducing the exact old 4-band walk byte-for-byte.
   */
  private selectByTimeBandPreference(
    candidates: Record<string, unknown>[],
    currentTotal: number,
    target: number,
    correlationId?: string,
  ): Record<string, unknown>[] {
    const rungKey = (timeBand: string, sizeTier: string) => `${timeBand}:${sizeTier}`;
    const byRung = new Map<string, Record<string, unknown>[]>();
    for (const c of candidates) {
      const timeBand = String(c.time_band ?? 'last_resort');
      const sizeTier = String(c.size_tier ?? 'preferred');
      const key = rungKey(timeBand, sizeTier);
      if (!byRung.has(key)) byRung.set(key, []);
      byRung.get(key)!.push(c);
    }

    const included: Record<string, unknown>[] = [];
    let runningTotal = currentTotal;
    for (const rung of SELECTION_RUNGS) {
      if (runningTotal >= target) break;
      const rungCandidates = byRung.get(rungKey(rung.timeBand, rung.sizeTier)) ?? [];
      included.push(...rungCandidates);
      runningTotal += rungCandidates.length;
    }

    this.logEvent('GENERATE.time_band_preference', {
      correlationId,
      input: candidates.length,
      included: included.length,
      currentTotal,
      target,
      rungCounts: Object.fromEntries(
        SELECTION_RUNGS.map((r) => [rungKey(r.timeBand, r.sizeTier), (byRung.get(rungKey(r.timeBand, r.sizeTier)) ?? []).length]),
      ),
    });

    return included;
  }

  /**
   * Deterministic confidence signal for a selected/ranked comparable set — deliberately NOT an
   * LLM-self-reported percentage (poorly calibrated, and contrary to this file's whole "don't
   * trust LLM judgment on anything computable" philosophy). Built purely from fields this file
   * already computes per candidate: time_band and zoning_confidence. size_tier is deliberately
   * excluded — see IDEAL_EVIDENCE_RATIO_THRESHOLD's doc comment.
   */
  private computeEvidenceConfidence(
    selected: Record<string, unknown>[],
    target: number,
    minimum: number,
    correlationId?: string,
  ): EvidenceConfidence {
    const count = selected.length;
    const idealCount = selected.filter((c) => {
      const timeBand = String(c.time_band ?? 'last_resort');
      const zoningConfidence = String(c.zoning_confidence ?? 'same_family');
      // 'extrapolated' (ranked-last-resort — see selectRankedLastResortCandidates) is explicitly
      // excluded here, unlike 'widened' (see IDEAL_EVIDENCE_RATIO_THRESHOLD's doc comment on why
      // size_tier is otherwise ignored) — this tier exists specifically to never be mistaken for
      // strong evidence, regardless of how MINIMUM_COMPARABLES/TARGET_COMPARABLES are tuned later.
      return (timeBand === 'fresh' || timeBand === 'recent')
        && zoningConfidence !== 'different_class_last_resort'
        && c.size_tier !== 'extrapolated';
    }).length;
    const idealRatio = count > 0 ? idealCount / count : 0;
    const tier: EvidenceConfidence['tier'] =
      count < minimum ? 'insufficient'
      : (count >= target && idealRatio >= IDEAL_EVIDENCE_RATIO_THRESHOLD) ? 'strong'
      : 'adequate';

    this.logEvent('GENERATE.evidence_confidence', { correlationId, tier, idealRatio, count, target, minimum });
    return { tier, idealRatio, count };
  }

  // Non-mutating — safe to call after every round boundary to decide whether to keep widening.
  // Only the LAST call's `selected` is ever used as the actual final selection, so this never
  // calls selectByTimeBandPreference more than once per round boundary actually reached.
  private previewSelection(
    accumulatedPool: Record<string, unknown>[],
    correlationId: string | undefined,
  ): { selected: Record<string, unknown>[]; confidence: EvidenceConfidence } {
    const selected = this.selectByTimeBandPreference(accumulatedPool, 0, TARGET_COMPARABLES, correlationId);
    const confidence = this.computeEvidenceConfidence(selected, TARGET_COMPARABLES, MINIMUM_COMPARABLES, correlationId);
    return { selected, confidence };
  }

  /**
   * Deterministic auto-include — scans the ENTIRE distance-filtered candidate pool (not just
   * the ~10 records an LLM call happens to select) and returns every candidate that exactly
   * matches the subject's zoning and computes, via the same computeAdjustedFields math used
   * everywhere else in this file, to adjusted_rate_per_sqm <= vgRate.
   *
   * "Does this sale support the objection" is a deterministic calculation already implemented
   * correctly in computeAdjustedFields — this stops asking the LLM to guess it via proxies
   * (raw rate, recency, tier ordering) that don't reliably correlate with the true, multi-factor
   * adjusted rate. Compatible-zoning (non-exact) candidates are deliberately excluded here even
   * if their computed rate would support the objection — they still require an LLM-authored
   * zoning_justification, so they stay on the runComparableRound path.
   *
   * Uses classifySizeTier (not filterOutsideSizeBand) so a candidate outside the standard ±30%
   * band but within the wider SIZE_BAND_WIDENED_TOLERANCE_FRACTION isn't discarded outright — it's
   * tagged 'widened' and handed to selectByTimeBandPreference, which only reaches for it ahead of
   * a stale ('last_resort') candidate, never instead of a same-band one. A 'widened' candidate
   * that's ALSO 'last_resort' is excluded here entirely (not merely deprioritized) — see
   * SELECTION_RUNGS's doc comment for why compounding both extrapolations isn't acceptable.
   */
  private identifyAutoIncludable(
    pool: Record<string, unknown>[],
    subject: SubjectContext,
    vgRate: number | null,
    correlationId?: string,
  ): Record<string, unknown>[] {
    if (vgRate === null || subject.zoning === 'unknown') return [];
    const subjectZoning = subject.zoning.trim().toUpperCase();

    const dateFiltered = this.filterFutureDatedCandidates(pool, subject, correlationId);
    const wholeInterestOnly = this.filterPartialInterestSales(dateFiltered, correlationId);

    let sizeExcludedCount = 0;
    const sizeClassified: Record<string, unknown>[] = [];
    for (const c of wholeInterestOnly) {
      const size_tier = this.classifySizeTier(c, subject);
      if (size_tier === 'excluded') { sizeExcludedCount++; continue; }
      sizeClassified.push({ ...c, size_tier });
    }

    const exactZoningMatches = sizeClassified.filter(
      (c) => String(c.zoning ?? '').trim().toUpperCase() === subjectZoning,
    );

    const autoIncluded = exactZoningMatches
      .map((c): Record<string, unknown> => ({ ...c, ...this.computeAdjustedFields(c, subject, null) }))
      .filter((item) => item.adjusted_rate_per_sqm !== null && Number(item.adjusted_rate_per_sqm) <= vgRate)
      .filter((item) => !(item.size_tier === 'widened' && item.time_band === 'last_resort'));

    this.logEvent('GENERATE.auto_included', {
      correlationId,
      poolSize: pool.length,
      exactZoningMatchCount: exactZoningMatches.length,
      autoIncludedCount: autoIncluded.length,
      widenedTierIncludedCount: autoIncluded.filter((c) => c.size_tier === 'widened').length,
      sizeExcludedCount,
    });

    return autoIncluded;
  }

  /**
   * Ranked last-resort — the final safety net when GENERATE.zoning_last_resort still leaves the
   * case under MINIMUM_COMPARABLES. Every tier above this one is a hard gate (pass/fail on a
   * fixed threshold); this tier instead re-scores every candidate already fetched across every
   * round above (never re-queries the DB — see allConsideredPool in generateComparableSales) by
   * weighted closeness to the subject on size deviation, zoning match, distance and recency, and
   * returns the `needed` best-ranked. Deliberately skips the LLM: there's no judgement call left
   * to make (deterministic scoring, same philosophy as computeEvidenceConfidence's doc comment on
   * preferring computed signals over LLM self-reporting), and computeAdjustedFields's
   * rankedLastResort flag adds an unconditional disclosure bullet in place of an LLM-authored
   * zoning_justification. Still runs the same non-negotiable correctness gates every other path
   * uses (no future-dated sales, no partial-interest sales, must still support the objection) —
   * only the size/zoning THRESHOLDS are bypassed here, never basic correctness.
   */
  private selectRankedLastResortCandidates(
    pool: Record<string, unknown>[],
    subject: SubjectContext,
    vgRate: number | null,
    needed: number,
    resolvedIds: Set<string>,
    correlationId?: string,
  ): Record<string, unknown>[] {
    if (vgRate === null || needed <= 0) return [];

    // allConsideredPool is a straight concatenation across every round's own geo-filtered pool —
    // seenPoolIds/excludeIds already prevent the SAME physical sale being re-fetched by a LATER
    // round in production, but this dedupes defensively anyway (by id, first-seen wins) so a gap
    // in that upstream guarantee can never surface the same sale as multiple "comparables".
    const seenIds = new Set<string>();
    const deduped = pool.filter((c) => {
      const id = String(c.id);
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

    const unresolved = deduped.filter((c) => !resolvedIds.has(String(c.id)));
    const dateFiltered = this.filterFutureDatedCandidates(unresolved, subject, correlationId);
    const wholeInterestOnly = this.filterPartialInterestSales(dateFiltered, correlationId);

    const subjectZoning = subject.zoning !== 'unknown' ? subject.zoning.trim().toUpperCase() : null;

    const scored = wholeInterestOnly
      .map((candidate) => {
        // rankedLastResort=true — adds the unconditional disclosure bullet in computeAdjustedFields'
        // explanation instead of relying on an LLM-authored zoning_justification (there is none here).
        const adjusted = this.computeAdjustedFields(candidate, subject, null, true);
        if (adjusted.adjusted_rate_per_sqm === null || Number(adjusted.adjusted_rate_per_sqm) > vgRate) return null;

        let area = candidate.area != null ? Number(candidate.area) : null;
        if (area == null) return null;
        if (candidate.area_type === 'H') area = Math.round(area * 10000);
        // Raw (uncapped) deviation is kept alongside for logging — GENERATE.ranked_last_resort
        // should show the real percentage even when the scoring term below clamps it.
        const sizeDeviation = subject.landAreaSqm ? Math.abs(area - subject.landAreaSqm) / subject.landAreaSqm : 0;
        const sizeDeviationScored = Math.min(RANKED_LAST_RESORT_SIZE_DEVIATION_CAP, sizeDeviation);

        // Missing candidate zoning is always the conservative worst case (mirrors
        // computeAdjustedFields' zoning_confidence precedent below) — checked before the
        // subject-unknown case so the two functions never disagree on the same candidate.
        const candidateZoning = String(candidate.zoning ?? '').trim().toUpperCase();
        const zoningPenalty = !candidateZoning ? 1
          : !subjectZoning ? 0
          : candidateZoning === subjectZoning ? 0
          : zoningFamily(candidateZoning) === zoningFamily(subjectZoning) ? 0.4
          : 1;

        const distanceKm = typeof candidate._distanceKm === 'number' ? candidate._distanceKm : null;
        const distancePenalty = distanceKm != null ? Math.min(1, distanceKm / ROUND3_MAX_KM) : 1;

        const timePenalty = adjusted.time_band === 'fresh' ? 0
          : adjusted.time_band === 'recent' ? 0.33
          : adjusted.time_band === 'adjusted' ? 0.66
          : 1;

        const score =
          RANKED_LAST_RESORT_SIZE_WEIGHT * sizeDeviationScored +
          RANKED_LAST_RESORT_ZONING_WEIGHT * zoningPenalty +
          RANKED_LAST_RESORT_DISTANCE_WEIGHT * distancePenalty +
          RANKED_LAST_RESORT_TIME_WEIGHT * timePenalty;

        const withFields: Record<string, unknown> = { ...candidate, ...adjusted, size_tier: 'extrapolated' as const };
        return { candidate: withFields, score, sizeDeviation, zoningPenalty };
      })
      .filter((r): r is { candidate: Record<string, unknown>; score: number; sizeDeviation: number; zoningPenalty: number } => r !== null)
      .sort((a, b) => a.score - b.score);

    const selected = scored.slice(0, needed);
    for (const s of selected) resolvedIds.add(String(s.candidate.id));

    this.logEvent('GENERATE.ranked_last_resort', {
      correlationId,
      poolSize: pool.length,
      eligibleCount: scored.length,
      selectedCount: selected.length,
      needed,
      topPicks: selected.map((s) => ({
        id: s.candidate.id,
        score: Number(s.score.toFixed(3)),
        sizeDeviationPct: Math.round(s.sizeDeviation * 100),
        zoningPenalty: s.zoningPenalty,
      })),
    });

    return selected.map((s) => s.candidate);
  }

  async create(
    disputeCaseId: string,
    dto: CreateComparableDto,
    createdById: string,
  ): Promise<ComparableResponseDto> {
    await this.assertDisputeCaseExists(disputeCaseId);
    if (dto.contract_date) this.assertSaleDateNotFuture(dto.contract_date);

    const comparable = this.comparablesRepository.create({
      dispute_case_id: disputeCaseId,
      created_by_id: createdById,
      sale_id: dto.sale_id ?? null,
      source_file: dto.source_file ?? null,
      imported_at: dto.imported_at ? new Date(dto.imported_at) : null,
      district_code: dto.district_code ?? null,
      property_id: dto.property_id ?? null,
      sale_counter: dto.sale_counter ?? null,
      download_datetime: dto.download_datetime ? new Date(dto.download_datetime) : null,
      property_name: dto.property_name ?? null,
      property_unit_number: dto.property_unit_number ?? null,
      property_house_number: dto.property_house_number ?? null,
      property_street_name: dto.property_street_name ?? null,
      property_locality: dto.property_locality ?? null,
      property_post_code: dto.property_post_code ?? null,
      area: dto.area ?? null,
      contract_date: dto.contract_date ? new Date(dto.contract_date) : null,
      settlement_date: dto.settlement_date ? new Date(dto.settlement_date) : null,
      purchase_price: dto.purchase_price ?? null,
      zoning: dto.zoning ?? null,
      nature_of_property: dto.nature_of_property ?? null,
      primary_purpose: dto.primary_purpose ?? null,
      strata_lot_number: dto.strata_lot_number ?? null,
      component_code: dto.component_code ?? null,
      sale_code: dto.sale_code ?? null,
      interest_of_sale_percent: dto.interest_of_sale_percent ?? null,
      dealing_number: dto.dealing_number ?? null,
      owner_type: dto.owner_type ?? null,
      adjusted_rate_per_sqm: dto.adjusted_rate_per_sqm ?? null,
      explanation: dto.explanation ?? null,
      improvement_confidence: dto.improvement_confidence ?? null,
    });

    const saved = await this.comparablesRepository.save(comparable);
    return plainToInstance(ComparableResponseDto, saved);
  }

  async findByApplicationId(disputeCaseId: string): Promise<ComparableResponseDto[]> {
    await this.assertDisputeCaseExists(disputeCaseId);

    const comparables = await this.comparablesRepository.find({
      where: { dispute_case_id: disputeCaseId },
    });

    return plainToInstance(ComparableResponseDto, comparables);
  }

  async findRawByDisputeCaseId(disputeCaseId: string): Promise<ComparableSale[]> {
    return this.comparablesRepository.find({
      where: { dispute_case_id: disputeCaseId },
    });
  }

  /**
   * Gate check — throws InsufficientComparablesException if the dispute case
   * has fewer than MINIMUM_COMPARABLES comparables.
   * Call this before advancing a dispute case to the APPRAISAL status.
   */
  async assertMinimumComparables(disputeCaseId: string): Promise<void> {
    const count = await this.comparablesRepository.count({
      where: { dispute_case_id: disputeCaseId },
    });

    if (count < MINIMUM_COMPARABLES) {
      throw new InsufficientComparablesException(count);
    }
  }

  async generateComparableSales(
    dto: GenerateComparableSalesDto,
    createdById: string,
    correlationId?: string,
  ): Promise<ComparableResponseDto[]> {
    const start = Date.now();

    this.logEvent('GENERATE.start', { correlationId, disputeCaseId: dto.dispute_case_id });

    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id: dto.dispute_case_id },
      relations: ['property', 'valuation_notice'],
    });
    if (!disputeCase) throw new DisputeCaseNotFoundException(dto.dispute_case_id);

    const subject = this.resolveSubjectContext(dto, disputeCase);
    this.logEvent('GENERATE.subject', { correlationId, subject });

    const subjectCentroid = await this.resolveSubjectCentroid(subject, correlationId);

    const vgRate = subject.landAreaSqm && subject.landAreaSqm > 0
      ? Math.round(subject.vgValueCurrent / subject.landAreaSqm)
      : null;

    // Union of every candidate id fetched by ANY round's SQL prefetch so far — fed to each
    // subsequent broadening round's excludeIds so it never re-fetches a row already considered.
    const seenPoolIds = new Set<unknown>();
    // Union of every dealing_number (the real-world legal transaction) considered by ANY round so
    // far — dedupeByDealingNumber (candidate-stratification.util.ts) only dedupes WITHIN a single
    // prefetch call's own result set, so without this a multi-lot sale (one dealing_number, several
    // property_sales_raw ids) could have one sibling row survive round 1 and a DIFFERENT sibling
    // get freshly fetched by a later, more broadly-scoped round — seenPoolIds alone wouldn't catch
    // it, since only the specific id already seen is excluded, not the underlying transaction. See
    // excludeSeenDealingNumbers.
    const seenDealingNumbers = new Set<string>();
    // Every id mechanically resolved (auto-includable or LLM-supporting) across every round so
    // far — see gatherRoundCandidates for why this is needed even though seenPoolIds already
    // prevents the SQL layer from re-fetching the same row.
    const resolvedIds = new Set<string>();
    // Raw gathered candidates across every round so far — NOT yet selected/ranked. Final
    // selection happens once, over this whole pool, after widening stops (see previewSelection),
    // so a stronger later-round candidate can displace a weaker earlier-round one rather than
    // just piling on top of it.
    const accumulatedPool: Record<string, unknown>[] = [];
    // Every geo-filtered candidate seen across every round below, regardless of whether it went
    // on to pass any hard gate — kept purely so selectRankedLastResortCandidates has a pool to
    // re-rank from at the very end without re-querying the DB. Never used for anything else.
    const allConsideredPool: Record<string, unknown>[] = [];
    let roundsRun = 0;
    let selected: Record<string, unknown>[] = [];
    let confidence: EvidenceConfidence = { tier: 'insufficient', idealRatio: 0, count: 0 };

    // Round 1: suburb-scoped candidates, gated to genuinely nearby sales by real distance —
    // the SQL tiers (suburb/postcode/postcode-prefix) are a performance pre-filter only.
    const round1Pool = await this.prefetchCandidateSales(subject, correlationId);
    for (const c of round1Pool) seenPoolIds.add(c.id);
    const round1Deduped = this.excludeSeenDealingNumbers(round1Pool, seenDealingNumbers, correlationId);
    const round1Geo = await this.filterByDistance(round1Deduped, subjectCentroid, ROUND1_MAX_KM, correlationId);
    allConsideredPool.push(...round1Geo);
    roundsRun++;
    accumulatedPool.push(...(await this.gatherRoundCandidates(
      round1Geo, subject, vgRate, ROUND1_MAX_KM, subjectCentroid, resolvedIds, correlationId, roundsRun,
    )));
    ({ selected, confidence } = this.previewSelection(accumulatedPool, correlationId));

    // Round 2: broaden to postcode-prefix zone if confidence hasn't reached 'strong' yet — this
    // subsumes the old pure count-based check, since 'strong' already requires count >= target,
    // so a case that hit the target with weak (e.g. all last_resort) evidence keeps widening
    // instead of stopping early. Still gated by distance (a wider radius), since the broadened
    // SQL query drops the suburb constraint entirely.
    if (vgRate !== null && roundsRun < MAX_ROUNDS && confidence.tier !== 'strong') {
      this.logEvent('GENERATE.broadening_search', {
        correlationId, round: 2, ...confidence, target: TARGET_COMPARABLES,
      });
      const round2Pool = await this.prefetchBroadCandidateSales(subject, seenPoolIds, correlationId);
      for (const c of round2Pool) seenPoolIds.add(c.id);
      const round2Deduped = this.excludeSeenDealingNumbers(round2Pool, seenDealingNumbers, correlationId);
      const round2Geo = await this.filterByDistance(round2Deduped, subjectCentroid, ROUND2_MAX_KM, correlationId);
      allConsideredPool.push(...round2Geo);
      roundsRun++;
      if (round2Geo.length > 0) {
        accumulatedPool.push(...(await this.gatherRoundCandidates(
          round2Geo, subject, vgRate, ROUND2_MAX_KM, subjectCentroid, resolvedIds, correlationId, roundsRun,
        )));
      }
      ({ selected, confidence } = this.previewSelection(accumulatedPool, correlationId));
    }

    // Round 3: last-resort widening — wider distance AND a longer lookback window. Only fires
    // if confidence still hasn't reached 'strong' and the round cap hasn't been reached.
    if (vgRate !== null && roundsRun < MAX_ROUNDS && confidence.tier !== 'strong') {
      this.logEvent('GENERATE.broadening_search', {
        correlationId, round: 3, ...confidence, target: TARGET_COMPARABLES,
      });
      const round3Pool = await this.prefetchBroadCandidateSales(subject, seenPoolIds, correlationId, ROUND3_LOOKBACK_YEARS);
      for (const c of round3Pool) seenPoolIds.add(c.id);
      const round3Deduped = this.excludeSeenDealingNumbers(round3Pool, seenDealingNumbers, correlationId);
      const round3Geo = await this.filterByDistance(round3Deduped, subjectCentroid, ROUND3_MAX_KM, correlationId);
      allConsideredPool.push(...round3Geo);
      roundsRun++;
      if (round3Geo.length > 0) {
        accumulatedPool.push(...(await this.gatherRoundCandidates(
          round3Geo, subject, vgRate, ROUND3_MAX_KM, subjectCentroid, resolvedIds, correlationId, roundsRun,
        )));
      }
      ({ selected, confidence } = this.previewSelection(accumulatedPool, correlationId));
    }

    // Zoning last-resort — the only avenue left once every normal (same-zoning-family) widening
    // round is exhausted and the case is STILL under the hard MINIMUM_COMPARABLES floor (not
    // merely short of the TARGET_COMPARABLES aspiration). Drops the zoning-family restriction that
    // every prior round enforces at the SQL level, so a genuinely different-zoned sale can be
    // considered — but only with an LLM-authored justification and a server-computed
    // zoning_confidence disclosure (see computeAdjustedFields), never auto-included.
    if (vgRate !== null && confidence.count < MINIMUM_COMPARABLES) {
      this.logEvent('GENERATE.zoning_last_resort', { correlationId, ...confidence, minimum: MINIMUM_COMPARABLES });
      const lastResortPool = await this.prefetchZoningLastResortCandidates(subject, seenPoolIds, correlationId);
      for (const c of lastResortPool) seenPoolIds.add(c.id);
      const lastResortDeduped = this.excludeSeenDealingNumbers(lastResortPool, seenDealingNumbers, correlationId);
      const lastResortGeo = await this.filterByDistance(lastResortDeduped, subjectCentroid, ROUND3_MAX_KM, correlationId);
      allConsideredPool.push(...lastResortGeo);
      if (lastResortGeo.length > 0) {
        accumulatedPool.push(...(await this.gatherRoundCandidates(
          lastResortGeo, subject, vgRate, ROUND3_MAX_KM, subjectCentroid, resolvedIds, correlationId, roundsRun + 1, true,
        )));
      }
      ({ selected, confidence } = this.previewSelection(accumulatedPool, correlationId));
    }

    // Ranked last-resort — the final safety net once every hard-gated round above (including the
    // zoning-family bypass) still leaves the case under the hard MINIMUM_COMPARABLES floor. Rather
    // than another SQL prefetch + hard gate + widen cycle, this re-ranks every candidate already
    // considered by every round above (allConsideredPool) by weighted closeness to the subject —
    // size deviation, zoning family, distance, recency — and surfaces the best available as
    // explicitly flagged, non-auto-included, manual-review evidence (see
    // selectRankedLastResortCandidates and computeAdjustedFields's rankedLastResort disclosure
    // bullet). This never runs in place of the hard-gated paths above, only once they've already
    // given up — a genuinely atypical subject (e.g. a large/rare-zoned parcel) can otherwise end
    // the case with zero comparables even after considering 100+ candidates across every round.
    if (vgRate !== null && confidence.count < MINIMUM_COMPARABLES) {
      const needed = MINIMUM_COMPARABLES - confidence.count;
      this.logEvent('GENERATE.ranked_last_resort_triggered', { correlationId, ...confidence, minimum: MINIMUM_COMPARABLES, needed });
      const ranked = this.selectRankedLastResortCandidates(
        allConsideredPool, subject, vgRate, needed, resolvedIds, correlationId,
      );
      accumulatedPool.push(...ranked);
      ({ selected, confidence } = this.previewSelection(accumulatedPool, correlationId));
    }

    // selectByTimeBandPreference never truncates mid-rung (every candidate in a rung already
    // passed every hard gate), so a wide round sweeping in a whole same-rung cluster can far
    // exceed TARGET_COMPARABLES. This is the one place that trims it back down — after every
    // widening/confidence decision is already made, so it never affects which rounds ran, only
    // how many of the (already best-evidence-first-ordered) final picks get persisted.
    if (selected.length > MAX_PERSISTED_COMPARABLES) {
      this.logEvent('GENERATE.trimmed_to_max_persisted', {
        correlationId, disputeCaseId: dto.dispute_case_id,
        selectedCount: selected.length, cap: MAX_PERSISTED_COMPARABLES,
      });
    }
    const allSupporting = selected.slice(0, MAX_PERSISTED_COMPARABLES);
    if (allSupporting.length !== selected.length) {
      // zoning_confidence is a distinct axis from the time/size rung grouping selectByTimeBandPreference
      // truncates by, so a single rung can be a non-homogeneous mix — recompute so every downstream
      // log/report reflects what's actually persisted, not the pre-slice set's confidence.
      confidence = this.computeEvidenceConfidence(allSupporting, TARGET_COMPARABLES, MINIMUM_COMPARABLES, correlationId);
    }

    // Honest reporting — if we're still short of the hard floor after every round we're willing
    // to run, say so loudly rather than silently falling through to InsufficientComparablesException
    // (thrown later, elsewhere, with no context on how hard we tried) or widening indefinitely.
    if (allSupporting.length < MINIMUM_COMPARABLES) {
      this.logEvent('GENERATE.insufficient_evidence_after_widening', {
        correlationId,
        disputeCaseId: dto.dispute_case_id,
        finalCount: allSupporting.length,
        minimumRequired: MINIMUM_COMPARABLES,
        targetAspiration: TARGET_COMPARABLES,
        roundsRun,
      });
    } else if (allSupporting.length < TARGET_COMPARABLES) {
      this.logEvent('GENERATE.target_not_reached', {
        correlationId,
        disputeCaseId: dto.dispute_case_id,
        finalCount: allSupporting.length,
        targetAspiration: TARGET_COMPARABLES,
        roundsRun,
      });
    } else if (confidence.tier !== 'strong') {
      // Count met, but quality never cleared IDEAL_EVIDENCE_RATIO_THRESHOLD even after
      // exhausting every widening avenue — today's code logs nothing at all in this case.
      this.logEvent('GENERATE.target_reached_low_confidence', {
        correlationId,
        disputeCaseId: dto.dispute_case_id,
        finalCount: allSupporting.length,
        idealRatio: confidence.idealRatio,
        roundsRun,
      });
    }

    this.logEvent('GENERATE.persist', {
      correlationId,
      supportingCount: allSupporting.length,
    });
    const saved = await this.persistComparables(allSupporting, dto.dispute_case_id, createdById);
    this.logEvent('GENERATE.complete', {
      correlationId,
      disputeCaseId: dto.dispute_case_id,
      savedCount: saved.length,
      totalDurationMs: Date.now() - start,
    });
    return saved;
  }

  private async runComparableRound(
    candidates: Record<string, unknown>[],
    subject: SubjectContext,
    vgRate: number | null,
    maxDistanceKm: number,
    subjectCentroid: { lat: number; lng: number } | null,
    correlationId: string | undefined,
    zoningLastResort: boolean = false,
  ): Promise<{ enriched: Record<string, unknown>[]; supporting: Record<string, unknown>[] }> {
    if (candidates.length === 0) return { enriched: [], supporting: [] };

    const userPrompt = buildUserPrompt(subject, candidates, maxDistanceKm, zoningLastResort);
    const systemPrompt = `${this.skillContent}\n\n## property_sales_raw schema (do NOT call list_tables or describe_table — query directly)\n\`\`\`\n${this.schemaBlock}\n\`\`\``;

    this.logEvent('GENERATE.anthropic.start', { correlationId, systemPromptLength: systemPrompt.length, candidateCount: candidates.length });
    const anthropicT = Date.now();
    let rawText: string;
    try {
      const result = await this.anthropic.call({
        systemBlocks: [{ text: systemPrompt }],
        userMessage: userPrompt,
        maxTokens: 32000,
        mcpServers: true,
      });

      this.logEvent('GENERATE.token_usage', {
        correlationId,
        model: ANTHROPIC_MODEL,
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        cache_read_input_tokens: result.usage.cacheReadInputTokens,
        cache_creation_input_tokens: result.usage.cacheCreationInputTokens,
        durationMs: Date.now() - anthropicT,
        stop_reason: result.stopReason,
      });

      if (result.stopReason === 'max_tokens') {
        this.logger.error('[GENERATE] Response was truncated at max_tokens — increase max_tokens or reduce result set');
        throw new LlmTruncationException();
      }
      if (result.stopReason === 'tool_use') {
        this.logEvent('GENERATE.unexpected_tool_use', { correlationId });
        throw new LlmToolUseException();
      }
      rawText = result.text;
    } catch (err: unknown) {
      if (err instanceof APIError) {
        const status = err.status;
        this.logEvent('GENERATE.anthropic_error', { correlationId, status, errorMessage: err.message });
        if (status === 529 || status === 503) throw new LlmApiException('Anthropic API is temporarily overloaded. Please retry in a few seconds.', 503);
        if (status === 401) throw new LlmApiException('Anthropic API key is invalid or expired.', 502);
      }
      throw err;
    }

    let parsed: Record<string, unknown>[];
    try {
      parsed = this.anthropic.parseJsonArray<Record<string, unknown>>(rawText);
    } catch (parseErr) {
      this.logger.error('[GENERATE] Could not parse JSON array from response', rawText.slice(0, 200));
      throw new LlmParseException(parseErr instanceof Error ? parseErr.message : 'JSON parse failed');
    }

    // Merge each LLM pick against its original SQL-fetched record BEFORE running any gate —
    // area_type and interest_of_sale_percent (needed by filterOutsideSizeBand/
    // filterPartialInterestSales, and already relied on by computeAdjustedFields) are
    // deliberately not part of the LLM's echoed output schema (see comparables.prompts.ts), so a
    // gate reading them off the raw `parsed` JSON would always see undefined.
    const candidateMap = new Map(candidates.map(c => [String(c.id), c]));
    const zoningJustificationById = new Map(parsed.map((item) => [String(item.id), item.zoning_justification]));

    const localMatches = parsed
      .map((item) => candidateMap.get(String(item.id)))
      .filter((c): c is Record<string, unknown> => c !== undefined);
    // Any id the LLM sourced via the search_comparable_sales MCP tool (not present in the local
    // SQL-fetched `candidates` pool) is re-fetched from the canonical table below rather than
    // trusted from the LLM's own echoed JSON — every hard gate that follows needs real
    // interest_of_sale_percent/area_type/zoning to actually gate anything, and an MCP-sourced row
    // never ran through filterByDistance either (that gate only runs on the SQL-prefetched pool
    // before it's handed to the LLM). An id that doesn't resolve to a real row is dropped, never
    // persisted — every other LLM-echoed field for these rows is discarded, not just unverified ones.
    const mcpSourcedIds = parsed
      .map((item) => String(item.id))
      .filter((id) => !candidateMap.has(id));

    let merged: Record<string, unknown>[] = localMatches.map((candidate) => ({
      ...candidate, zoning_justification: zoningJustificationById.get(String(candidate.id)),
    }));

    if (mcpSourcedIds.length > 0) {
      const canonicalRows = await this.fetchCanonicalCandidatesByIds(mcpSourcedIds, correlationId);
      const canonicalIds = new Set(canonicalRows.map((r) => String(r.id)));
      const unresolvedIds = mcpSourcedIds.filter((id) => !canonicalIds.has(id));
      if (unresolvedIds.length > 0) {
        this.logEvent('GENERATE.mcp_candidate_unresolved', { correlationId, unresolvedIds });
      }
      const mcpGeo = await this.filterByDistance(canonicalRows, subjectCentroid, maxDistanceKm, correlationId);
      merged = merged.concat(mcpGeo.map((candidate) => ({
        ...candidate, zoning_justification: zoningJustificationById.get(String(candidate.id)),
      })));
    }

    merged = this.filterFutureDatedCandidates(merged, subject, correlationId);
    merged = this.filterPartialInterestSales(merged, correlationId);
    merged = this.filterOutsideSizeBand(merged, subject, correlationId);
    // Zoning-class hard gate is bypassed only in the explicit last-resort round (see
    // prefetchZoningLastResortCandidates) — every other round keeps it, and
    // filterMissingZoningJustification still requires a justification for any non-exact zoning
    // match regardless, so a different-class pick can't slip through undisclosed either way.
    if (!zoningLastResort) merged = this.filterDifferentZoningClass(merged, subject, correlationId);
    merged = this.filterMissingZoningJustification(merged, subject, correlationId);

    const enriched = merged.map(candidate => {
      const zoningJustification = typeof candidate.zoning_justification === 'string' ? candidate.zoning_justification : null;
      return { ...candidate, ...this.computeAdjustedFields(candidate, subject, zoningJustification) };
    });

    const supporting = vgRate !== null
      ? enriched.filter(item => item.adjusted_rate_per_sqm !== null && Number(item.adjusted_rate_per_sqm) <= vgRate)
      : enriched;

    return { enriched, supporting };
  }

  // Re-fetches canonical property_sales_raw rows by id — used to re-verify candidates the LLM
  // sourced via the search_comparable_sales MCP tool rather than the SQL pre-fetch, so the hard
  // gates in runComparableRound see real DB values instead of whatever the LLM chose to echo back.
  // Same column list as prefetchCandidateSales's analysisColumns (kept local rather than shared —
  // this file already duplicates that list per prefetch method).
  private async fetchCanonicalCandidatesByIds(
    ids: string[],
    correlationId?: string,
  ): Promise<Record<string, unknown>[]> {
    if (ids.length === 0) return [];
    const analysisColumns = `id, property_id, district_code, property_house_number, property_street_name,
      property_locality, property_post_code, area, area_type, zoning, nature_of_property,
      primary_purpose, component_code, sale_code, interest_of_sale_percent,
      contract_date, purchase_price, dealing_number, owner_type`;
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT ${analysisColumns} FROM property_sales_raw WHERE id::text = ANY($1)`,
      [ids],
    );
    this.logEvent('GENERATE.mcp_candidates_refetched', { correlationId, requested: ids.length, resolved: rows.length });
    return rows;
  }

  /**
   * Gathers (but does NOT select/rank) one round's worth of candidates: the deterministic
   * auto-includable subset of `geoFilteredPool`, plus whatever the LLM separately supports for
   * the remainder. Every mechanically-resolved candidate — auto-includable or LLM-supporting —
   * is added to `resolvedIds` immediately, regardless of whether it ultimately ends up in the
   * final N. This is what lets the caller accumulate a pool across multiple rounds and make ONE
   * final rung-based selection at the end (see `computeEvidenceConfidence`/`generateComparableSales`),
   * so a stronger later-round candidate can actually displace a weaker earlier-round one instead
   * of just piling on top of it.
   *
   * `resolvedIds` is threaded across every round and is the single source of truth for "already
   * mechanically evaluated" — it also guards against the search_comparable_sales MCP fallback
   * tool re-surfacing an id from a previous round (that tool queries the live DB directly and
   * isn't constrained by the SQL-level excludeIds passed to the prefetch queries), so an id can
   * never be double-counted regardless of whether it arrived via auto-include or two different
   * LLM calls. Populating it immediately for every auto-includable candidate (not just ones a
   * round happened to select) closes a latent gap the old locking design had: a candidate that
   * qualified but wasn't picked could previously re-enter via that same MCP tool in a later round.
   *
   * LLM failures propagate as they do today (no try/catch here) — a hard Anthropic error still
   * aborts the whole generateComparableSales call, preserving existing failure/retry semantics,
   * including for rounds that only run to chase evidence quality rather than raw count.
   */
  private async gatherRoundCandidates(
    geoFilteredPool: Record<string, unknown>[],
    subject: SubjectContext,
    vgRate: number | null,
    maxDistanceKm: number,
    subjectCentroid: { lat: number; lng: number } | null,
    resolvedIds: Set<string>,
    correlationId: string | undefined,
    roundNumber: number,
    zoningLastResort: boolean = false,
  ): Promise<Record<string, unknown>[]> {
    const autoIncludableAllBands = this.identifyAutoIncludable(geoFilteredPool, subject, vgRate, correlationId)
      .filter((c) => !resolvedIds.has(String(c.id)));
    for (const c of autoIncludableAllBands) resolvedIds.add(String(c.id));

    const llmPool = geoFilteredPool.filter((c) => !resolvedIds.has(String(c.id)));
    const round = await this.runComparableRound(llmPool, subject, vgRate, maxDistanceKm, subjectCentroid, correlationId, zoningLastResort);
    const llmSupportingDeduped = round.supporting.filter((c) => !resolvedIds.has(String(c.id)));
    for (const c of llmSupportingDeduped) resolvedIds.add(String(c.id));

    this.logEvent('GENERATE.round_gathered', {
      correlationId,
      round: roundNumber,
      poolSize: geoFilteredPool.length,
      llmPoolSize: llmPool.length,
      autoIncludableCount: autoIncludableAllBands.length,
      llmSupportingCount: llmSupportingDeduped.length,
    });

    return [...autoIncludableAllBands, ...llmSupportingDeduped];
  }

  private async prefetchBroadCandidateSales(
    subject: SubjectContext,
    excludeIds: Set<unknown>,
    correlationId: string | undefined,
    lookbackYears: number = 5,
  ): Promise<Record<string, unknown>[]> {
    const preT = Date.now();
    try {
      const vd = new Date(subject.valuationDate);
      const searchFrom = new Date(vd);
      searchFrom.setFullYear(searchFrom.getFullYear() - lookbackYears);
      const searchFromStr = isNaN(searchFrom.getTime())
        ? new Date(Date.now() - lookbackYears * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : searchFrom.toISOString().split('T')[0];
      const searchToStr = isNaN(vd.getTime())
        ? new Date().toISOString().split('T')[0]
        : vd.toISOString().split('T')[0];

      const zoningPrefix = subject.zoning !== 'unknown' ? subject.zoning.substring(0, 2).toUpperCase() + '%' : null;
      const postcodePrefix = subject.postcode ? subject.postcode.substring(0, 3) + '%' : null;
      if (!postcodePrefix || !zoningPrefix) return [];

      const analysisColumns = `id, property_id, district_code, property_house_number, property_street_name,
        property_locality, property_post_code, area, area_type, zoning, nature_of_property,
        primary_purpose, component_code, sale_code, interest_of_sale_percent,
        contract_date, purchase_price, dealing_number, owner_type`;

      const excludeArr = [...excludeIds].map(Number).filter(n => !isNaN(n));
      const rows: Record<string, unknown>[] = excludeArr.length > 0
        ? await this.dataSource.query(
          `WITH scoped AS (
             SELECT ${analysisColumns},
                    CASE WHEN nature_of_property = 'V' OR UPPER(primary_purpose) LIKE '%VACANT%' THEN 0 ELSE 1 END AS vacant_priority,
                    NTILE($6) OVER (ORDER BY contract_date ASC, id ASC) AS time_bucket
             FROM property_sales_raw
             WHERE property_post_code LIKE $1 AND UPPER(zoning) LIKE $2
               AND contract_date >= $3 AND contract_date <= $4
               AND id != ALL($5::bigint[])
           ),
           ranked AS (
             SELECT *, ROW_NUMBER() OVER (PARTITION BY time_bucket ORDER BY vacant_priority ASC, contract_date DESC, id ASC) AS bucket_rank
             FROM scoped
           )
           SELECT ${analysisColumns}, time_bucket FROM ranked
           WHERE bucket_rank <= $7
           ORDER BY time_bucket ASC, bucket_rank ASC, id ASC`,
          [postcodePrefix, zoningPrefix, searchFromStr, searchToStr, excludeArr,
            TIME_STRATIFICATION_BUCKETS, BROAD_SQL_PER_BUCKET_CAP],
        )
        : await this.dataSource.query(
          `WITH scoped AS (
             SELECT ${analysisColumns},
                    CASE WHEN nature_of_property = 'V' OR UPPER(primary_purpose) LIKE '%VACANT%' THEN 0 ELSE 1 END AS vacant_priority,
                    NTILE($5) OVER (ORDER BY contract_date ASC, id ASC) AS time_bucket
             FROM property_sales_raw
             WHERE property_post_code LIKE $1 AND UPPER(zoning) LIKE $2
               AND contract_date >= $3 AND contract_date <= $4
           ),
           ranked AS (
             SELECT *, ROW_NUMBER() OVER (PARTITION BY time_bucket ORDER BY vacant_priority ASC, contract_date DESC, id ASC) AS bucket_rank
             FROM scoped
           )
           SELECT ${analysisColumns}, time_bucket FROM ranked
           WHERE bucket_rank <= $6
           ORDER BY time_bucket ASC, bucket_rank ASC, id ASC`,
          [postcodePrefix, zoningPrefix, searchFromStr, searchToStr,
            TIME_STRATIFICATION_BUCKETS, BROAD_SQL_PER_BUCKET_CAP],
        );

      const deduped = dedupeByDealingNumber(rows);
      const candidates = stripInternalFields(
        selectTimeDiverseSubsetWithVacantFloor(deduped, MAX_CANDIDATE_SALES, BROAD_VACANT_FLOOR),
      );
      this.logEvent('GENERATE.prefetch_broad', { correlationId, count: candidates.length, lookbackYears, durationMs: Date.now() - preT });
      return candidates;
    } catch (err) {
      this.logger.warn('[GENERATE] Broad pre-fetch failed', (err as Error).message);
      return [];
    }
  }

  /**
   * Genuine last resort — every other prefetch tier restricts to the subject's zoning family at
   * the SQL level (zoningFamilyPattern/zoningPrefix), so a different-zoning-class sale is never
   * even fetched, let alone reaches filterDifferentZoningClass. This query is the only one that
   * drops the zoning WHERE clause entirely, so a case with essentially no same-family evidence can
   * surface flagged, disclosed, LLM-justified different-zoning-class sales instead of throwing
   * InsufficientComparablesException outright. Only ever called after MAX_ROUNDS of normal
   * same-family widening still leaves the case under MINIMUM_COMPARABLES.
   */
  private async prefetchZoningLastResortCandidates(
    subject: SubjectContext,
    excludeIds: Set<unknown>,
    correlationId: string | undefined,
  ): Promise<Record<string, unknown>[]> {
    const preT = Date.now();
    try {
      const vd = new Date(subject.valuationDate);
      const searchFrom = new Date(vd);
      searchFrom.setFullYear(searchFrom.getFullYear() - ROUND3_LOOKBACK_YEARS);
      const searchFromStr = isNaN(searchFrom.getTime())
        ? new Date(Date.now() - ROUND3_LOOKBACK_YEARS * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : searchFrom.toISOString().split('T')[0];
      const searchToStr = isNaN(vd.getTime())
        ? new Date().toISOString().split('T')[0]
        : vd.toISOString().split('T')[0];

      const postcodePrefix = subject.postcode ? subject.postcode.substring(0, 3) + '%' : null;
      if (!postcodePrefix) return [];

      const analysisColumns = `id, property_id, district_code, property_house_number, property_street_name,
        property_locality, property_post_code, area, area_type, zoning, nature_of_property,
        primary_purpose, component_code, sale_code, interest_of_sale_percent,
        contract_date, purchase_price, dealing_number, owner_type`;

      const excludeArr = [...excludeIds].map(Number).filter(n => !isNaN(n));
      const rows: Record<string, unknown>[] = excludeArr.length > 0
        ? await this.dataSource.query(
          `WITH scoped AS (
             SELECT ${analysisColumns},
                    CASE WHEN nature_of_property = 'V' OR UPPER(primary_purpose) LIKE '%VACANT%' THEN 0 ELSE 1 END AS vacant_priority,
                    NTILE($5) OVER (ORDER BY contract_date ASC, id ASC) AS time_bucket
             FROM property_sales_raw
             WHERE property_post_code LIKE $1
               AND contract_date >= $2 AND contract_date <= $3
               AND id != ALL($4::bigint[])
           ),
           ranked AS (
             SELECT *, ROW_NUMBER() OVER (PARTITION BY time_bucket ORDER BY vacant_priority ASC, contract_date DESC, id ASC) AS bucket_rank
             FROM scoped
           )
           SELECT ${analysisColumns}, time_bucket FROM ranked
           WHERE bucket_rank <= $6
           ORDER BY time_bucket ASC, bucket_rank ASC, id ASC`,
          [postcodePrefix, searchFromStr, searchToStr, excludeArr, TIME_STRATIFICATION_BUCKETS, BROAD_SQL_PER_BUCKET_CAP],
        )
        : await this.dataSource.query(
          `WITH scoped AS (
             SELECT ${analysisColumns},
                    CASE WHEN nature_of_property = 'V' OR UPPER(primary_purpose) LIKE '%VACANT%' THEN 0 ELSE 1 END AS vacant_priority,
                    NTILE($4) OVER (ORDER BY contract_date ASC, id ASC) AS time_bucket
             FROM property_sales_raw
             WHERE property_post_code LIKE $1
               AND contract_date >= $2 AND contract_date <= $3
           ),
           ranked AS (
             SELECT *, ROW_NUMBER() OVER (PARTITION BY time_bucket ORDER BY vacant_priority ASC, contract_date DESC, id ASC) AS bucket_rank
             FROM scoped
           )
           SELECT ${analysisColumns}, time_bucket FROM ranked
           WHERE bucket_rank <= $5
           ORDER BY time_bucket ASC, bucket_rank ASC, id ASC`,
          [postcodePrefix, searchFromStr, searchToStr, TIME_STRATIFICATION_BUCKETS, BROAD_SQL_PER_BUCKET_CAP],
        );

      const deduped = dedupeByDealingNumber(rows);
      const candidates = stripInternalFields(
        selectTimeDiverseSubsetWithVacantFloor(deduped, MAX_CANDIDATE_SALES, BROAD_VACANT_FLOOR),
      );
      this.logEvent('GENERATE.prefetch_zoning_last_resort', { correlationId, count: candidates.length, durationMs: Date.now() - preT });
      return candidates;
    } catch (err) {
      this.logger.warn('[GENERATE] Zoning-last-resort pre-fetch failed', (err as Error).message);
      return [];
    }
  }

  private resolveSubjectContext(
    dto: GenerateComparableSalesDto,
    disputeCase: DisputeCase,
  ): SubjectContext {
    const vn = disputeCase.valuation_notice;
    const valuationDate = dto.valuation_date
      ?? (vn?.valuation_date ? new Date(vn.valuation_date).toISOString().split('T')[0] : null);
    if (!valuationDate) throw new MissingValuationDateException(disputeCase.id);

    // Persisted, previously-resolved property data outranks per-request fields — a caller
    // passing a stale/ad-hoc land_area_sqm or land_area_eplanning_sqm must never silently
    // override the cadastre/ePlanning figure already on file (see MissingLandAreaException
    // below for the no-source-at-all case). Mirrors the same priority used for site area in
    // ValuationReportService.buildUserMessage.
    const landAreaSqm =
      (Number(disputeCase.property?.land_area_eplanning_sqm) || null)
      ?? (Number(disputeCase.property?.land_area_sqm) || null)
      ?? dto.land_area_sqm
      ?? (Number(vn?.land_area_vg_sqm) || null)
      ?? dto.land_area_eplanning_sqm
      ?? null;
    if (landAreaSqm == null) throw new MissingLandAreaException(disputeCase.id);

    return {
      pid: dto.pid ?? disputeCase.property?.pid ?? 'unknown',
      suburb: stripTrailingPostcode((dto.suburb || disputeCase.property?.suburb || '').trim()).toUpperCase(),
      postcode: dto.postcode || disputeCase.property?.postcode || null,
      landAreaSqm,
      zoning: dto.zoning ?? disputeCase.property?.zoning ?? 'unknown',
      lotDp: dto.lot_dp ?? disputeCase.property?.lot_dp ?? null,
      dimensions: dto.dimensions ?? disputeCase.property?.dimensions ?? null,
      heightLimitM: dto.height_limit_m ?? disputeCase.property?.height_limit_m ?? null,
      vgValueCurrent: dto.vg_land_value_current ?? (Number(vn?.assessed_land_value) || 0),
      vgValuePrior: dto.vg_land_value_prior ?? (Number(vn?.prior_land_value) || 0),
      landAreaVgSqm: dto.land_area_vg_sqm ?? (Number(vn?.land_area_vg_sqm) || null),
      valuationDate,
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
    };
  }

  private async prefetchCandidateSales(
    subject: SubjectContext,
    correlationId?: string,
  ): Promise<Record<string, unknown>[]> {
    const preT = Date.now();
    try {
      const vd = new Date(subject.valuationDate);
      const searchFrom = new Date(vd);
      searchFrom.setFullYear(searchFrom.getFullYear() - 5);
      const searchFromStr = isNaN(searchFrom.getTime())
        ? new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : searchFrom.toISOString().split('T')[0];
      // Sales dated after the valuation date can't be reliably adjusted back to the base
      // date, so they're excluded from the candidate pool entirely rather than left to the
      // LLM/time-adjustment math to handle.
      const searchToStr = isNaN(vd.getTime())
        ? new Date().toISOString().split('T')[0]
        : vd.toISOString().split('T')[0];

      const zoningPrefix = subject.zoning !== 'unknown' ? subject.zoning.substring(0, 2).toUpperCase() + '%' : null;
      // Different zoning class (a different family, e.g. Residential vs Rural) is hard-excluded
      // per the comparable-selection screening guide — "a different-use sale is not comparable
      // at all". Same-family subtypes (e.g. R2 vs R3) remain eligible as "compatible zoning".
      const subjectFamily = subject.zoning !== 'unknown' ? zoningFamily(subject.zoning).replace(/[^A-Z]/g, '') : null;
      const zoningFamilyPattern = subjectFamily ? `^${subjectFamily}[0-9]*$` : null;

      // Select only the columns needed for analysis — avoids sending metadata columns
      // (source_file, imported_at, download_datetime, sale_counter, etc.) to the LLM.
      const analysisColumns = `id, property_id, district_code, property_house_number, property_street_name,
        property_locality, property_post_code, area, area_type, zoning, nature_of_property,
        primary_purpose, component_code, sale_code, interest_of_sale_percent,
        contract_date, purchase_price, dealing_number, owner_type`;

      const postcodePrefix = subject.postcode ? subject.postcode.substring(0, 3) + '%' : null;

      // Each tier is quintile-stratified by contract_date (NTILE over the already-filtered
      // rows) rather than a plain `ORDER BY contract_date DESC LIMIT N` — a flat recency
      // ordering meant the candidate pool was always "the N most recent sales", systematically
      // excluding older-but-valid sales elsewhere in the 5-year lookback window (verified
      // against the real dev DB — see MAX_CANDIDATE_SALES comment above). Per-bucket caps
      // preserve each tier's old total LIMIT (120/80/60); the diversity comes from *which*
      // rows survive within that ceiling, not from raising it.
      const [tier1, tier2, tier3] = await Promise.all([
        // Tier 1: Same suburb, same zoning family (same-zoning sorted first) — this is the
        // only tier that was previously zoning-unfiltered, so it's the only one that needs
        // the explicit family gate; tiers 2/3 already filter on zoningPrefix, which is at
        // least as strict as family-level.
        subject.suburb
          ? this.dataSource.query(
            `WITH scoped AS (
               SELECT ${analysisColumns},
                      CASE WHEN UPPER(zoning) LIKE $5 THEN 0 ELSE 1 END AS exact_zoning_priority,
                      CASE WHEN nature_of_property = 'V' OR UPPER(primary_purpose) LIKE '%VACANT%' THEN 0 ELSE 1 END AS vacant_priority,
                      NTILE($6) OVER (ORDER BY contract_date ASC, id ASC) AS time_bucket
               FROM property_sales_raw
               WHERE UPPER(property_locality) = $1
                 AND contract_date >= $2 AND contract_date <= $3
                 AND ($4::text IS NULL OR zoning ~* $4)
             ),
             ranked AS (
               SELECT *, ROW_NUMBER() OVER (
                 PARTITION BY time_bucket ORDER BY exact_zoning_priority ASC, vacant_priority ASC, contract_date DESC, id ASC
               ) AS bucket_rank
               FROM scoped
             )
             SELECT ${analysisColumns}, time_bucket FROM ranked
             WHERE bucket_rank <= $7
             ORDER BY time_bucket ASC, bucket_rank ASC, id ASC`,
            [subject.suburb, searchFromStr, searchToStr, zoningFamilyPattern, zoningPrefix ?? '%',
              TIME_STRATIFICATION_BUCKETS, TIER1_SQL_PER_BUCKET_CAP],
          )
          : Promise.resolve([]),
        // Tier 2: Same postcode (covers adjoining suburbs in the same locality), same zoning
        subject.postcode && zoningPrefix
          ? this.dataSource.query(
            `WITH scoped AS (
               SELECT ${analysisColumns},
                      CASE WHEN nature_of_property = 'V' OR UPPER(primary_purpose) LIKE '%VACANT%' THEN 0 ELSE 1 END AS vacant_priority,
                      NTILE($5) OVER (ORDER BY contract_date ASC, id ASC) AS time_bucket
               FROM property_sales_raw
               WHERE property_post_code = $1 AND UPPER(zoning) LIKE $2
                 AND contract_date >= $3 AND contract_date <= $4
             ),
             ranked AS (
               SELECT *, ROW_NUMBER() OVER (PARTITION BY time_bucket ORDER BY vacant_priority ASC, contract_date DESC, id ASC) AS bucket_rank
               FROM scoped
             )
             SELECT ${analysisColumns}, time_bucket FROM ranked
             WHERE bucket_rank <= $6
             ORDER BY time_bucket ASC, bucket_rank ASC, id ASC`,
            [subject.postcode, zoningPrefix, searchFromStr, searchToStr,
              TIME_STRATIFICATION_BUCKETS, TIER2_SQL_PER_BUCKET_CAP],
          )
          : Promise.resolve([]),
        // Tier 3: Broader postcode corridor (same first 3 digits), same zoning
        postcodePrefix && zoningPrefix
          ? this.dataSource.query(
            `WITH scoped AS (
               SELECT ${analysisColumns},
                      CASE WHEN nature_of_property = 'V' OR UPPER(primary_purpose) LIKE '%VACANT%' THEN 0 ELSE 1 END AS vacant_priority,
                      NTILE($5) OVER (ORDER BY contract_date ASC, id ASC) AS time_bucket
               FROM property_sales_raw
               WHERE property_post_code LIKE $1 AND UPPER(zoning) LIKE $2
                 AND contract_date >= $3 AND contract_date <= $4
             ),
             ranked AS (
               SELECT *, ROW_NUMBER() OVER (PARTITION BY time_bucket ORDER BY vacant_priority ASC, contract_date DESC, id ASC) AS bucket_rank
               FROM scoped
             )
             SELECT ${analysisColumns}, time_bucket FROM ranked
             WHERE bucket_rank <= $6
             ORDER BY time_bucket ASC, bucket_rank ASC, id ASC`,
            [postcodePrefix, zoningPrefix, searchFromStr, searchToStr,
              TIME_STRATIFICATION_BUCKETS, TIER3_SQL_PER_BUCKET_CAP],
          )
          : Promise.resolve([]),
      ]);

      const merged = mergeById({ tier: 1, rows: tier1 }, { tier: 2, rows: tier2 }, { tier: 3, rows: tier3 });
      const deduped = dedupeByDealingNumber(merged);

      const tier1Rows = deduped.filter((r) => r._tier === 1);
      const tier2Rows = deduped.filter((r) => r._tier === 2);
      const tier3Rows = deduped.filter((r) => r._tier === 3);

      // Reserved-floor apportionment — Tier 1 keeps priority (same suburb is the strongest
      // evidence) but Tier 2/3 can never be crowded to zero; unused budget waterfalls to the
      // next-priority tier. See assembleTieredCandidates doc comment.
      const candidates = assembleTieredCandidates(tier1Rows, tier2Rows, tier3Rows, {
        total: MAX_CANDIDATE_SALES,
        tier1Target: TIER1_TARGET,
        tier2Floor: TIER2_FLOOR,
        tier3Floor: TIER3_FLOOR,
        tier1VacantFloor: TIER1_VACANT_FLOOR,
        tier2VacantFloor: TIER2_VACANT_FLOOR,
        tier3VacantFloor: TIER3_VACANT_FLOOR,
      });

      this.logEvent('GENERATE.prefetch', {
        correlationId,
        count: candidates.length,
        tier1Count: tier1Rows.length,
        tier2Count: tier2Rows.length,
        tier3Count: tier3Rows.length,
        durationMs: Date.now() - preT,
      });
      return candidates;
    } catch (err) {
      this.logger.warn('[GENERATE] Pre-fetch failed — Claude will query via MCP', (err as Error).message);
      return [];
    }
  }

  private computeAdjustedFields(
    candidate: Record<string, unknown>,
    subject: SubjectContext,
    zoningJustification: string | null = null,
    rankedLastResort: boolean = false,
  ): {
    adjusted_rate_per_sqm: number | null;
    adjusted_land_value: number | null;
    suggested_land_value: number | null;
    explanation: string | null;
    improvement_confidence: 'exact' | 'estimated' | null;
    time_band: 'fresh' | 'recent' | 'adjusted' | 'last_resort' | null;
    zoning_confidence: 'same_family' | 'different_class_last_resort' | null;
  } {
    const purchasePrice = candidate.purchase_price != null ? Number(candidate.purchase_price) : null;
    let area = candidate.area != null ? Number(candidate.area) : null;
    // A missing/unparseable contract_date means we have no idea how old this sale is — that's
    // excluded here alongside the other required fields, not defaulted to the best-case (freshest,
    // no-adjustment-needed) time band. Previously monthsDiff/timeFactor/time_band were initialized
    // to 0/1/'fresh' and only recomputed inside an `if (contractDate...)` block below, so a null
    // date silently kept those best-case defaults instead of excluding the candidate — verified
    // live (a sale with contract_date: null was persisted and rendered as "fresh, nil adjustment").
    const contractDate = candidate.contract_date ? new Date(candidate.contract_date as string) : null;
    if (!purchasePrice || !area || !subject.landAreaSqm || !contractDate || isNaN(contractDate.getTime())) {
      return { adjusted_rate_per_sqm: null, adjusted_land_value: null, suggested_land_value: null, explanation: null, improvement_confidence: null, time_band: null, zoning_confidence: null };
    }

    // property_sales_raw.area_type is an authoritative 'H'/'M' flag on the source record —
    // use it directly rather than guessing from the magnitude of `area` (a numeric threshold
    // like "area < 100 => hectares" misclassifies a real, unpredictable share of rows in every
    // zoning code, verified against the dev DB — e.g. a genuine 93m² Glebe terrace lot vs a
    // genuine 93-hectare rural block are indistinguishable by number alone).
    if (candidate.area_type === 'H') area = Math.round(area * 10000);

    // isVacantLandRow is the canonical nature_of_property/primary_purpose check (see
    // candidate-stratification.util.ts); the blank-primary_purpose fallback below is a distinct,
    // deliberate rule specific to the improvement-deduction decision — "we have no evidence of a
    // structure" — so it stays additive rather than folded into the shared predicate.
    const isVacant = isVacantLandRow(candidate) ||
      !candidate.primary_purpose ||
      String(candidate.primary_purpose).trim() === '';

    let improvementDeduction = 0;
    let landRate: number;
    if (isVacant) {
      landRate = purchasePrice / area;
    } else {
      improvementDeduction = Math.round(purchasePrice * 0.5);
      landRate = (purchasePrice - improvementDeduction) / area;
    }
    // Structured confidence signal — 'exact' needs no improvement estimate at all; 'estimated'
    // relies on the flat 50% deduction above (no GFA/building data exists in property_sales_raw
    // to do better).
    const improvement_confidence: 'exact' | 'estimated' = isVacant ? 'exact' : 'estimated';

    // area/subject.landAreaSqm (not the inverse) — economies of scale mean larger lots trade at a
    // lower $/m², so a comparable larger than the subject has its rate scaled UP to be comparable,
    // and a smaller comparable's rate is scaled down. See SIZE_BAND_TOLERANCE_FRACTION's comment
    // above for the same formula referenced in the ±30% size-band gate's rationale.
    const sizeFactor = Math.pow(area / subject.landAreaSqm, 0.15);
    const sizeAdjustedRate = landRate * sizeFactor;

    // contractDate is already guaranteed non-null/valid by the early-exclusion guard above.
    const valuationDate = new Date(subject.valuationDate);
    const monthsDiff = (valuationDate.getFullYear() - contractDate.getFullYear()) * 12
      + (valuationDate.getMonth() - contractDate.getMonth());
    let timeFactor = 1;
    let time_band: 'fresh' | 'recent' | 'adjusted' | 'last_resort';
    if (monthsDiff <= TIME_BAND_FRESH_MAX_MONTHS) {
      time_band = 'fresh'; // use as-is — timeFactor stays 1
    } else if (monthsDiff <= TIME_BAND_RECENT_MAX_MONTHS) {
      time_band = 'recent';
      timeFactor = 1 + monthsDiff * TIME_ADJUSTMENT_RATE_PER_MONTH * TIME_BAND_MINOR_ADJUSTMENT_FRACTION;
    } else if (monthsDiff <= TIME_BAND_ADJUSTED_MAX_MONTHS) {
      time_band = 'adjusted';
      timeFactor = 1 + monthsDiff * TIME_ADJUSTMENT_RATE_PER_MONTH;
    } else {
      time_band = 'last_resort';
      timeFactor = 1 + monthsDiff * TIME_ADJUSTMENT_RATE_PER_MONTH; // same formula as 'adjusted' —
      // this band differs only in SELECTION preference (see selectByTimeBandPreference), not math.
    }

    const adjusted_rate_per_sqm = Math.round(sizeAdjustedRate * timeFactor);
    const adjusted_land_value = Math.round(adjusted_rate_per_sqm * area);

    const vgRate = Math.round(subject.vgValueCurrent / subject.landAreaSqm);

    // Plausibility backstop — a rate under 1% or over 100x the VG's own assessed rate is not a
    // genuine market comparable, it's almost certainly a data error (e.g. a mis-flagged area
    // unit) that slipped past the area_type conversion above. Reject rather than let it silently
    // pass as "supporting" — protects both the auto-include path (no LLM/human in the loop) and
    // the LLM-selection path equally, since both funnel through this same function.
    if (adjusted_rate_per_sqm < vgRate * 0.01 || adjusted_rate_per_sqm > vgRate * 100) {
      this.logger.warn(`[GENERATE] Rejecting implausible adjusted rate $${adjusted_rate_per_sqm}/m² vs VG rate $${vgRate}/m² for candidate ${candidate.id} — likely a data-quality issue, not genuine evidence`);
      return { adjusted_rate_per_sqm: null, adjusted_land_value: null, suggested_land_value: null, explanation: null, improvement_confidence: null, time_band: null, zoning_confidence: null };
    }

    // Server-computed disclosure signal — never trusted from the LLM. 'same_family' covers both
    // an exact zoning match and the existing "compatible zoning" tier (same family, different
    // subtype); 'different_class_last_resort' only occurs when the caller has explicitly bypassed
    // the normal same-family SQL/gate restriction (see prefetchZoningLastResortCandidates) because
    // every other widening avenue was exhausted and the case was still under MINIMUM_COMPARABLES.
    const candidateZoningStr = String(candidate.zoning ?? '').trim();
    // A missing candidate zoning defaults to the CONSERVATIVE label, not the favorable one — we
    // can't verify family-match at all without knowing the zoning, so it's treated the same as a
    // confirmed mismatch (counts against computeEvidenceConfidence's idealRatio), never as
    // 'same_family'. subject.zoning === 'unknown' is a separate, pre-existing case (nothing to
    // compare against) and keeps its prior behavior.
    const zoning_confidence: 'same_family' | 'different_class_last_resort' =
      !candidateZoningStr
        ? 'different_class_last_resort'
        : subject.zoning === 'unknown' || zoningFamily(candidateZoningStr) === zoningFamily(subject.zoning)
          ? 'same_family'
          : 'different_class_last_resort';

    // Used only to keep the rankedLastResort disclosure bullet below honest — a candidate can
    // land in the ranked-last-resort tier simply because auto-include's EXACT-zoning requirement
    // or the LLM's own selection missed it, not because it's actually outside this report's
    // normal tolerances. Claiming "outside tolerance" for a candidate that's genuinely within it
    // would overstate how weak the evidence is.
    const areaRatio = area / subject.landAreaSqm;
    const withinNormalTolerance = zoning_confidence === 'same_family'
      && areaRatio >= (1 - SIZE_BAND_TOLERANCE_FRACTION) && areaRatio <= (1 + SIZE_BAND_TOLERANCE_FRACTION);

    const supportsObjection = adjusted_rate_per_sqm <= vgRate;

    // NSW VG definition: comparable's own adjusted land value = land component × time factor only.
    // No size adjustment — this is what the objector enters for each comparable in the NSW portal.
    const suggested_land_value = Math.round((purchasePrice - improvementDeduction) * timeFactor);

    const address = [candidate.property_house_number, candidate.property_street_name, candidate.property_locality].filter(Boolean).join(' ');
    const saleDateStr = contractDate && !isNaN(contractDate.getTime())
      ? contractDate.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'Unknown date';

    const sameSuburb = subject.suburb &&
      String(candidate.property_locality ?? '').trim().toUpperCase() === subject.suburb.toUpperCase();
    const distanceKm = typeof candidate._distanceKm === 'number' ? candidate._distanceKm : null;
    const proximityLabel = sameSuburb
      ? 'Same suburb'
      : distanceKm != null
        ? `Nearby suburb (${distanceKm.toFixed(1)}km away)`
        : 'Nearby suburb';
    const areaRatioPct = Math.round(Math.abs(area - subject.landAreaSqm) / subject.landAreaSqm * 100);
    const similarityLine = [
      proximityLabel,
      `same ${candidate.zoning} zoning`,
      `${areaRatioPct}% ${area > subject.landAreaSqm ? 'larger' : 'smaller'} (${area.toLocaleString()}m² vs ${subject.landAreaSqm.toLocaleString()}m² subject)`,
    ].join(' · ');

    const isCompatibleZoning = subject.zoning !== 'unknown' &&
      String(candidate.zoning ?? '').trim().toUpperCase() !== subject.zoning.trim().toUpperCase();

    const conclusionLine = supportsObjection
      ? `The adjusted rate of $${adjusted_rate_per_sqm.toLocaleString()}/m² is below the VG's assessed rate of $${vgRate.toLocaleString()}/m², supporting a lower land value for your property.`
      : `The adjusted rate of $${adjusted_rate_per_sqm.toLocaleString()}/m² exceeds the VG's assessed rate of $${vgRate.toLocaleString()}/m². Included as the closest available market evidence in the ${String(candidate.property_locality ?? subject.suburb)} ${subject.zoning} corridor — insufficient supporting comparable sales were found at this threshold.`;

    const explanation = [
      `${address} | ${candidate.zoning} | ${isVacant ? 'Vacant Land' : `Improved - ${candidate.primary_purpose}`}`,
      rankedLastResort
        ? withinNormalTolerance
          ? `• ℹ SELECTED VIA RANKED LAST-RESORT FALLBACK — this comparable is within the report's standard size and zoning tolerances but wasn't picked up by automatic inclusion (which requires an exact zoning match) or the LLM selection step; included deterministically to help reach the minimum evidence requirement. A quick manual check is still recommended.`
          : `• ⚠ RANKED LAST-RESORT MATCH — no comparable sale was found within this report's standard size/zoning tolerances even after full geographic and time-period widening. This is the closest available match by combined size, zoning, distance and recency proximity, included so the objection isn't left without evidence. Manual valuer review is strongly recommended before relying on this comparable.`
        : null,
      similarityLine,
      `• Sale: ${saleDateStr} — $${purchasePrice.toLocaleString()} (${area}m²)`,
      isCompatibleZoning && zoningJustification ? `• Zoning justification: ${zoningJustification}` : null,
      zoning_confidence === 'different_class_last_resort'
        ? `• Zoning confidence: DIFFERENT ZONING CLASS — included only as a last resort because insufficient same-family zoning evidence exists elsewhere; treat this comparable with reduced weight.`
        : null,
      `• Raw land rate: $${Math.round(landRate).toLocaleString()}/m²${!isVacant ? ` (after improvement deduction of $${improvementDeduction.toLocaleString()})` : ''}`,
      `• Size adjustment: factor ${sizeFactor.toFixed(3)} (${subject.landAreaSqm}m² subject vs ${area}m² comparable) → $${Math.round(sizeAdjustedRate).toLocaleString()}/m²`,
      candidate.size_tier === 'widened'
        ? `• Size tolerance: outside the standard ±${SIZE_BAND_TOLERANCE_FRACTION * 100}% band but within the widened ±${SIZE_BAND_WIDENED_TOLERANCE_FRACTION * 100}% tolerance — included because comparable date-proximity was prioritised over strict size matching.`
        : null,
      `• Time adjustment: ${monthsDiff} months (${time_band} band) — ${
        time_band === 'fresh' ? 'nil (within 6-month window, used as-is)'
        : time_band === 'recent' ? `minor +${((timeFactor - 1) * 100).toFixed(1)}% (6-12 month band)`
        : time_band === 'adjusted' ? `+${((timeFactor - 1) * 100).toFixed(1)}% (12-18 month band, adjustment required)`
        : `+${((timeFactor - 1) * 100).toFixed(1)}% (beyond 18 months — last-resort evidence)`
      } → $${adjusted_rate_per_sqm.toLocaleString()}/m²`,
      `• Adjusted rate: $${adjusted_rate_per_sqm.toLocaleString()}/m² vs VG rate $${vgRate.toLocaleString()}/m² → ${supportsObjection ? 'Supports objection ✓' : 'Does NOT support objection ✗'}`,
      `• Comparable adj. land value: $${adjusted_land_value.toLocaleString()}`,
      `• Implied subject land value: $${(adjusted_rate_per_sqm * subject.landAreaSqm).toLocaleString()} (at $${adjusted_rate_per_sqm.toLocaleString()}/m² × ${subject.landAreaSqm.toLocaleString()}m²)`,
      `• VG assessed value: $${subject.vgValueCurrent.toLocaleString()} — potential reduction of $${(subject.vgValueCurrent - adjusted_rate_per_sqm * subject.landAreaSqm).toLocaleString()}`,
      !isVacant ? `• Caveats: Improvement deduction estimated at 50% of purchase price ($${improvementDeduction.toLocaleString()}) — GFA unavailable` : null,
      conclusionLine,
    ].filter(Boolean).join('\n');

    return { adjusted_rate_per_sqm, adjusted_land_value, suggested_land_value, explanation, improvement_confidence, time_band, zoning_confidence };
  }

  private async persistComparables(
    parsed: Record<string, unknown>[],
    disputeCaseId: string,
    createdById: string,
  ): Promise<ComparableResponseDto[]> {
    const toSave = parsed.map((item) =>
      this.comparablesRepository.create({
        dispute_case_id: disputeCaseId,
        created_by_id: createdById,
        sale_id: item.id != null ? String(item.id) : null,
        source_file: (item.source_file as string) ?? null,
        imported_at: item.imported_at ? new Date(item.imported_at as string) : null,
        district_code: (item.district_code as string) ?? null,
        property_id: (item.property_id as string) ?? null,
        sale_counter: item.sale_counter != null ? Number(item.sale_counter) : null,
        download_datetime: item.download_datetime ? new Date(item.download_datetime as string) : null,
        property_name: (item.property_name as string) ?? null,
        property_unit_number: (item.property_unit_number as string) ?? null,
        property_house_number: (item.property_house_number as string) ?? null,
        property_street_name: (item.property_street_name as string) ?? null,
        property_locality: (item.property_locality as string) ?? null,
        property_post_code: (item.property_post_code as string) ?? null,
        area: item.area != null
          ? (item.area_type === 'H' ? Math.round(Number(item.area) * 10000) : Number(item.area))
          : null,
        contract_date: item.contract_date ? new Date(item.contract_date as string) : null,
        settlement_date: item.settlement_date ? new Date(item.settlement_date as string) : null,
        purchase_price: item.purchase_price != null ? Number(item.purchase_price) : null,
        zoning: (item.zoning as string) ?? null,
        nature_of_property: (item.nature_of_property as string) ?? null,
        primary_purpose: (item.primary_purpose as string) ?? null,
        strata_lot_number: (item.strata_lot_number as string) ?? null,
        component_code: (item.component_code as string) ?? null,
        sale_code: (item.sale_code as string) ?? null,
        interest_of_sale_percent: item.interest_of_sale_percent != null ? Number(item.interest_of_sale_percent) : null,
        dealing_number: (item.dealing_number as string) ?? null,
        owner_type: (item.owner_type as string) ?? null,
        adjusted_rate_per_sqm: item.adjusted_rate_per_sqm != null ? Number(item.adjusted_rate_per_sqm) : null,
        adjusted_land_value: item.adjusted_land_value != null ? Number(item.adjusted_land_value) : null,
        suggested_land_value: item.suggested_land_value != null ? Number(item.suggested_land_value) : null,
        explanation: (item.explanation as string) ?? null,
        improvement_confidence: (item.improvement_confidence as 'exact' | 'estimated') ?? null,
        size_tier: (item.size_tier as 'preferred' | 'widened' | 'extrapolated') ?? null,
      }),
    );

    const saved = await this.comparablesRepository.save(toSave);
    return plainToInstance(ComparableResponseDto, saved);
  }

  private async assertDisputeCaseExists(disputeCaseId: string): Promise<void> {
    const exists = await this.disputeCasesRepository.existsBy({ id: disputeCaseId });
    if (!exists) {
      throw new DisputeCaseNotFoundException(disputeCaseId);
    }
  }

  private assertSaleDateNotFuture(saleDateStr: string): void {
    const saleDate = new Date(saleDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (saleDate > today) {
      throw new FutureSaleDateException(saleDateStr);
    }
  }
}
