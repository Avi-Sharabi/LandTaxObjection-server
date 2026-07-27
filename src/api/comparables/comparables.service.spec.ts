import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ComparablesService } from './comparables.service';
import { ComparableSale } from './entities/comparable-sale.entity';
import { NswLocalityCentroid } from './entities/nsw-locality-centroid.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { GeocodingService } from '../supporting-evidence/shared/geocoding.service';
import { AnthropicService } from 'src/ai/anthropic.service';
import { SkillRegistryService } from '../../mcp/skill-registry.service';
import { SubjectContext } from './comparables.prompts';

const SUBJECT: SubjectContext = {
  pid: 'test-pid',
  suburb: 'TESTSUBURB',
  postcode: '2000',
  landAreaSqm: 500,
  zoning: 'R1',
  lotDp: null,
  dimensions: null,
  heightLimitM: null,
  vgValueCurrent: 2000000, // vgRate = 2,000,000 / 500 = 4,000/m²
  vgValuePrior: 0,
  landAreaVgSqm: null,
  valuationDate: '2025-07-01',
  lat: -33.0,
  lng: 151.0,
};
const VG_RATE = 4000;

function poolRow(overrides: Record<string, unknown>): Record<string, unknown> {
  const id = overrides.id ?? 'row-id';
  return {
    id,
    property_id: 'p1',
    district_code: 'd1',
    property_house_number: '1',
    property_street_name: 'TEST ST',
    property_locality: 'TESTSUBURB',
    property_post_code: '2000',
    area: 500,
    zoning: 'R1',
    nature_of_property: 'R',
    primary_purpose: 'RESIDENCE',
    component_code: 'ALG',
    sale_code: null,
    interest_of_sale_percent: 0,
    contract_date: '2025-01-01', // within 12mo of valuationDate — timeFactor stays 1
    purchase_price: 1500000, // landRate = (1500000*0.5)/500 = 1500/m² — well under vgRate
    dealing_number: `D-${id}`, // unique per row by default — avoids prefetchCandidateSales' dealing_number dedup collapsing distinct fixture rows
    owner_type: null,
    ...overrides,
  };
}

describe('ComparablesService — computeAdjustedFields (area_type + plausibility)', () => {
  let service: ComparablesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparablesService,
        { provide: getRepositoryToken(ComparableSale), useValue: {} },
        { provide: getRepositoryToken(DisputeCase), useValue: {} },
        { provide: getRepositoryToken(NswLocalityCentroid), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: SkillRegistryService, useValue: { getSkillContent: jest.fn() } },
        { provide: AnthropicService, useValue: { call: jest.fn(), parseJsonArray: jest.fn() } },
        { provide: GeocodingService, useValue: { geocode: jest.fn() } },
      ],
    }).compile();

    service = module.get<ComparablesService>(ComparablesService);
  });

  it('does not convert area for area_type="M" even when the raw number is small (the Glebe/Annandale bug)', () => {
    // Real-world shape: a genuine 93m² inner-Sydney terrace lot, flagged 'M' by the source data.
    const glebeLikeSale = poolRow({ id: 'glebe', area: 93, area_type: 'M', purchase_price: 1000000 });

    const result = (service as any).computeAdjustedFields(glebeLikeSale, SUBJECT, null);

    // Old bug would multiply area by 10,000 (=930,000m²), crushing the rate to a couple of
    // dollars per m². Correct behavior keeps it a plausible urban rate (thousands per m²).
    expect(result.adjusted_rate_per_sqm).not.toBeNull();
    expect(result.adjusted_rate_per_sqm).toBeGreaterThan(1000);
  });

  it('converts area for area_type="H" even when the raw number is >= 100 (the previously-unhandled opposite-direction bug)', () => {
    // A genuine 115.3-hectare rural parcel — compared against an internally-consistent
    // rural-scale subject so the result stays within the plausibility band (isolates this test
    // to just the area-conversion behavior, not the separate plausibility backstop).
    const ruralSubject: SubjectContext = { ...SUBJECT, landAreaSqm: 1000000, vgValueCurrent: 1000000 };
    const ruralSale = poolRow({
      id: 'corang', area: 115.3, area_type: 'H', purchase_price: 1400000,
      nature_of_property: 'V', primary_purpose: 'VACANT LAND',
    });

    const result = (service as any).computeAdjustedFields(ruralSale, ruralSubject, null);

    // Old bug (only converting when area < 100) would leave area at 115.3, producing a rate in
    // the thousands per m² for what's actually a 1.15M m² parcel. Correct behavior converts it,
    // producing a rate near $1/m² — genuinely cheap broadacre rural land.
    expect(result.adjusted_rate_per_sqm).not.toBeNull();
    expect(result.adjusted_rate_per_sqm).toBeLessThan(10);
  });

  it('rejects an implausibly low computed rate as a data-quality issue, not genuine evidence', () => {
    const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    // Even with a correct area (matches subject, no unit-conversion involved), a corrupted price
    // still produces a nonsensical rate — the backstop should catch this generically.
    const corruptedPriceSale = poolRow({ id: 'corrupted', area: 500, area_type: 'M', purchase_price: 100 });

    const result = (service as any).computeAdjustedFields(corruptedPriceSale, SUBJECT, null);

    expect(result).toEqual({
      adjusted_rate_per_sqm: null, adjusted_land_value: null, suggested_land_value: null,
      explanation: null, improvement_confidence: null, time_band: null, zoning_confidence: null,
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('implausible adjusted rate'));
  });

  it('rejects an implausibly high computed rate symmetrically', () => {
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    const corruptedPriceSale = poolRow({ id: 'corrupted-high', area: 500, area_type: 'M', purchase_price: 2000000000 });

    const result = (service as any).computeAdjustedFields(corruptedPriceSale, SUBJECT, null);

    expect(result.adjusted_rate_per_sqm).toBeNull();
  });

  it.each([
    ['2025-01-01', 'fresh'],   // monthsDiff=6, boundary — still fresh
    ['2024-12-01', 'recent'],  // monthsDiff=7, just past fresh
    ['2024-07-01', 'recent'],  // monthsDiff=12, boundary — still recent
    ['2024-06-01', 'adjusted'], // monthsDiff=13, just past recent
    ['2024-01-01', 'adjusted'], // monthsDiff=18, boundary — still adjusted
    ['2023-12-01', 'last_resort'], // monthsDiff=19, just past adjusted
  ])('contract_date %s maps to time_band=%s', (contractDate, expectedBand) => {
    const candidate = poolRow({ id: 'time-test', contract_date: contractDate });
    const result = (service as any).computeAdjustedFields(candidate, SUBJECT, null);
    expect(result.time_band).toBe(expectedBand);
  });

  it('fresh band applies no time adjustment', () => {
    const candidate = poolRow({ id: 'fresh', contract_date: '2025-06-01', purchase_price: 1500000 });
    const result = (service as any).computeAdjustedFields(candidate, SUBJECT, null);
    // landRate = (1500000*0.5)/500 = 1500; sizeFactor=1 (area matches subject); fresh -> timeFactor=1
    expect(result.adjusted_rate_per_sqm).toBe(1500);
  });

  it('sizeFactor scales a larger-than-subject comparable\'s rate UP, not down', () => {
    // Vacant sale (no improvement deduction) so landRate is exactly purchase_price/area = 1000,
    // isolating sizeFactor as the only thing that can move adjusted_rate_per_sqm away from 1000.
    // area(1000) is double subject.landAreaSqm(500) — economies of scale means this larger lot's
    // raw $/m² is scaled UP to be comparable to the smaller subject. A regression that inverts the
    // ratio back to (subject/area) would instead scale it down, flipping this assertion.
    const largerComp = poolRow({
      id: 'larger', area: 1000, purchase_price: 1000000,
      nature_of_property: 'V', primary_purpose: 'VACANT LAND', contract_date: '2025-06-01',
    });
    const result = (service as any).computeAdjustedFields(largerComp, SUBJECT, null);
    expect(result.adjusted_rate_per_sqm).toBeGreaterThan(1000);
  });

  it('sizeFactor scales a smaller-than-subject comparable\'s rate DOWN, not up', () => {
    // Same landRate (1000) as the larger-comp case above, but area(250) is half of
    // subject.landAreaSqm(500) — this smaller lot's raw $/m² is scaled DOWN. Together with the
    // "larger" case above, this pins down the sizeFactor formula's direction from both sides.
    const smallerComp = poolRow({
      id: 'smaller', area: 250, purchase_price: 250000,
      nature_of_property: 'V', primary_purpose: 'VACANT LAND', contract_date: '2025-06-01',
    });
    const result = (service as any).computeAdjustedFields(smallerComp, SUBJECT, null);
    expect(result.adjusted_rate_per_sqm).toBeLessThan(1000);
  });

  it('improvement_confidence is "exact" for a vacant sale', () => {
    const vacant = poolRow({ id: 'vacant', nature_of_property: 'V', primary_purpose: 'VACANT LAND', purchase_price: 1500000 });
    const result = (service as any).computeAdjustedFields(vacant, SUBJECT, null);
    expect(result.improvement_confidence).toBe('exact');
  });

  it('improvement_confidence is "estimated" for an improved sale', () => {
    const improved = poolRow({ id: 'improved', nature_of_property: 'R', primary_purpose: 'RESIDENCE', purchase_price: 1500000 });
    const result = (service as any).computeAdjustedFields(improved, SUBJECT, null);
    expect(result.improvement_confidence).toBe('estimated');
  });

  it('excludes a candidate with a null contract_date rather than defaulting it to the freshest time band', () => {
    const unknownDate = poolRow({ id: 'unknown-date', contract_date: null, purchase_price: 1500000 });
    const result = (service as any).computeAdjustedFields(unknownDate, SUBJECT, null);
    expect(result).toEqual({
      adjusted_rate_per_sqm: null, adjusted_land_value: null, suggested_land_value: null,
      explanation: null, improvement_confidence: null, time_band: null, zoning_confidence: null,
    });
  });

  it('excludes a candidate with an unparseable contract_date the same way', () => {
    const badDate = poolRow({ id: 'bad-date', contract_date: 'not-a-date', purchase_price: 1500000 });
    const result = (service as any).computeAdjustedFields(badDate, SUBJECT, null);
    expect(result.adjusted_rate_per_sqm).toBeNull();
  });

  it('zoning_confidence is "same_family" for an exact zoning match', () => {
    const exactMatch = poolRow({ id: 'exact-zoning', zoning: 'R1', purchase_price: 1500000 });
    const result = (service as any).computeAdjustedFields(exactMatch, SUBJECT, null);
    expect(result.zoning_confidence).toBe('same_family');
  });

  it('zoning_confidence is "different_class_last_resort" for a genuinely different zoning family', () => {
    const differentClass = poolRow({ id: 'diff-zoning', zoning: 'B1', purchase_price: 1500000 });
    const result = (service as any).computeAdjustedFields(differentClass, SUBJECT, null);
    expect(result.zoning_confidence).toBe('different_class_last_resort');
  });

  it('zoning_confidence is "different_class_last_resort" (never the favorable "same_family") when candidate zoning is null/empty', () => {
    const noZoning = poolRow({ id: 'no-zoning', zoning: null, purchase_price: 1500000 });
    const result = (service as any).computeAdjustedFields(noZoning, SUBJECT, null);
    expect(result.zoning_confidence).toBe('different_class_last_resort');
  });
});

describe('ComparablesService — filterPartialInterestSales', () => {
  let service: ComparablesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparablesService,
        { provide: getRepositoryToken(ComparableSale), useValue: {} },
        { provide: getRepositoryToken(DisputeCase), useValue: {} },
        { provide: getRepositoryToken(NswLocalityCentroid), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: SkillRegistryService, useValue: { getSkillContent: jest.fn() } },
        { provide: AnthropicService, useValue: { call: jest.fn(), parseJsonArray: jest.fn() } },
        { provide: GeocodingService, useValue: { geocode: jest.fn() } },
      ],
    }).compile();

    service = module.get<ComparablesService>(ComparablesService);
  });

  it('keeps a candidate with interest_of_sale_percent: null (documented whole-interest convention)', () => {
    const result = (service as any).filterPartialInterestSales([poolRow({ id: 'a', interest_of_sale_percent: null })]);
    expect(result.map((r: any) => r.id)).toEqual(['a']);
  });

  it('keeps a candidate with interest_of_sale_percent: 0 (documented whole-interest convention)', () => {
    const result = (service as any).filterPartialInterestSales([poolRow({ id: 'a', interest_of_sale_percent: 0 })]);
    expect(result.map((r: any) => r.id)).toEqual(['a']);
  });

  it('drops a genuine partial-interest sale (positive percentage)', () => {
    const result = (service as any).filterPartialInterestSales([poolRow({ id: 'a', interest_of_sale_percent: 50 })]);
    expect(result).toEqual([]);
  });

  it('drops a malformed (non-numeric) interest_of_sale_percent rather than treating it as whole-interest', () => {
    const result = (service as any).filterPartialInterestSales([poolRow({ id: 'a', interest_of_sale_percent: 'N/A' })]);
    expect(result).toEqual([]);
  });

  it('drops a negative interest_of_sale_percent rather than treating it as whole-interest', () => {
    const result = (service as any).filterPartialInterestSales([poolRow({ id: 'a', interest_of_sale_percent: -10 })]);
    expect(result).toEqual([]);
  });
});

describe('ComparablesService — filterMissingZoningJustification', () => {
  let service: ComparablesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparablesService,
        { provide: getRepositoryToken(ComparableSale), useValue: {} },
        { provide: getRepositoryToken(DisputeCase), useValue: {} },
        { provide: getRepositoryToken(NswLocalityCentroid), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: SkillRegistryService, useValue: { getSkillContent: jest.fn() } },
        { provide: AnthropicService, useValue: { call: jest.fn(), parseJsonArray: jest.fn() } },
        { provide: GeocodingService, useValue: { geocode: jest.fn() } },
      ],
    }).compile();

    service = module.get<ComparablesService>(ComparablesService);
  });

  it('keeps an exact zoning match with no justification required', () => {
    const result = (service as any).filterMissingZoningJustification([poolRow({ id: 'a', zoning: 'R1' })], SUBJECT);
    expect(result.map((r: any) => r.id)).toEqual(['a']);
  });

  it('drops a compatible-zoning pick that lacks a zoning_justification', () => {
    const result = (service as any).filterMissingZoningJustification([poolRow({ id: 'a', zoning: 'R2' })], SUBJECT);
    expect(result).toEqual([]);
  });

  it('keeps a compatible-zoning pick that has a zoning_justification', () => {
    const result = (service as any).filterMissingZoningJustification(
      [poolRow({ id: 'a', zoning: 'R2', zoning_justification: 'Same permitted uses.' })], SUBJECT,
    );
    expect(result.map((r: any) => r.id)).toEqual(['a']);
  });

  it('drops a candidate with null/empty zoning even without any compatibility mismatch — the least-certain case must not be exempted from the fail-closed check', () => {
    const result = (service as any).filterMissingZoningJustification([poolRow({ id: 'a', zoning: null })], SUBJECT);
    expect(result).toEqual([]);
  });

  it('drops a candidate with whitespace-only zoning the same way', () => {
    const result = (service as any).filterMissingZoningJustification([poolRow({ id: 'a', zoning: '   ' })], SUBJECT);
    expect(result).toEqual([]);
  });
});

describe('ComparablesService — classifySizeTier', () => {
  let service: ComparablesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparablesService,
        { provide: getRepositoryToken(ComparableSale), useValue: {} },
        { provide: getRepositoryToken(DisputeCase), useValue: {} },
        { provide: getRepositoryToken(NswLocalityCentroid), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: SkillRegistryService, useValue: { getSkillContent: jest.fn() } },
        { provide: AnthropicService, useValue: { call: jest.fn(), parseJsonArray: jest.fn() } },
        { provide: GeocodingService, useValue: { geocode: jest.fn() } },
      ],
    }).compile();

    service = module.get<ComparablesService>(ComparablesService);
  });

  it.each([
    [500, 'preferred'],  // exact match
    [350, 'preferred'],  // exact -30% boundary (500*0.7)
    [650, 'preferred'],  // exact +30% boundary (500*1.3)
    [349, 'widened'],    // just past the strict lower bound
    [651, 'widened'],    // just past the strict upper bound
    [250, 'widened'],    // exact -50% boundary (500*0.5), inclusive
    [750, 'widened'],    // exact +50% boundary (500*1.5), inclusive
    [249, 'excluded'],   // just past the widened lower bound
    [751, 'excluded'],   // just past the widened upper bound
  ])('area=%d classifies as %s (subject 500m²)', (area, expected) => {
    const candidate = poolRow({ id: 'size-test', area });
    const result = (service as any).classifySizeTier(candidate, SUBJECT);
    expect(result).toBe(expected);
  });

  it('applies the area_type="H" hectare conversion before classifying', () => {
    // 0.035 hectares = 350m² — exactly the ±30% lower boundary once converted.
    const candidate = poolRow({ id: 'hectare-test', area: 0.035, area_type: 'H' });
    const result = (service as any).classifySizeTier(candidate, SUBJECT);
    expect(result).toBe('preferred');
  });

  it('passes through as "preferred" when area is null/unparseable', () => {
    const candidate = poolRow({ id: 'no-area', area: null });
    const result = (service as any).classifySizeTier(candidate, SUBJECT);
    expect(result).toBe('preferred');
  });

  it('passes through as "preferred" when subject.landAreaSqm is falsy', () => {
    const candidate = poolRow({ id: 'any-area', area: 100000 });
    const noAreaSubject = { ...SUBJECT, landAreaSqm: 0 };
    const result = (service as any).classifySizeTier(candidate, noAreaSubject);
    expect(result).toBe('preferred');
  });
});

describe('ComparablesService — identifyAutoIncludable', () => {
  let service: ComparablesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparablesService,
        { provide: getRepositoryToken(ComparableSale), useValue: {} },
        { provide: getRepositoryToken(DisputeCase), useValue: {} },
        { provide: getRepositoryToken(NswLocalityCentroid), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: SkillRegistryService, useValue: { getSkillContent: jest.fn() } },
        { provide: AnthropicService, useValue: { call: jest.fn(), parseJsonArray: jest.fn() } },
        { provide: GeocodingService, useValue: { geocode: jest.fn() } },
      ],
    }).compile();

    service = module.get<ComparablesService>(ComparablesService);
  });

  it('auto-includes exact-zoning candidates whose adjusted rate supports the objection', () => {
    const supportingA = poolRow({ id: 'a', purchase_price: 1500000, contract_date: '2025-01-01' });
    const supportingB = poolRow({ id: 'b', purchase_price: 1600000, contract_date: '2025-02-01' });
    const supportingC = poolRow({ id: 'c', purchase_price: 1300000, contract_date: '2025-03-01' });

    const result = (service as any).identifyAutoIncludable([supportingA, supportingB, supportingC], SUBJECT, VG_RATE);

    expect(result.map((r: any) => r.id).sort()).toEqual(['a', 'b', 'c']);
    for (const r of result) {
      expect(r.adjusted_rate_per_sqm).toBeLessThanOrEqual(VG_RATE);
    }
  });

  it('excludes an exact-zoning candidate whose adjusted rate does not support the objection', () => {
    const nonSupporting = poolRow({ id: 'expensive', purchase_price: 4500000 }); // landRate = 4500/m² > vgRate

    const result = (service as any).identifyAutoIncludable([nonSupporting], SUBJECT, VG_RATE);

    expect(result).toEqual([]);
  });

  it('excludes a compatible-zoning (non-exact) candidate even if it would numerically support', () => {
    const compatibleZoning = poolRow({ id: 'r3-compatible', zoning: 'R3', purchase_price: 1500000 });

    const result = (service as any).identifyAutoIncludable([compatibleZoning], SUBJECT, VG_RATE);

    expect(result).toEqual([]);
  });

  it('returns nothing when vgRate is null', () => {
    const supporting = poolRow({ id: 'a' });
    const result = (service as any).identifyAutoIncludable([supporting], SUBJECT, null);
    expect(result).toEqual([]);
  });

  it('returns nothing when the subject zoning is unknown', () => {
    const supporting = poolRow({ id: 'a' });
    const unknownZoningSubject = { ...SUBJECT, zoning: 'unknown' };
    const result = (service as any).identifyAutoIncludable([supporting], unknownZoningSubject, VG_RATE);
    expect(result).toEqual([]);
  });

  it('excludes a candidate with a non-zero interest_of_sale_percent (part-interest sale), even though it would otherwise support', () => {
    const partialInterest = poolRow({ id: 'partial', interest_of_sale_percent: 50, purchase_price: 1500000 });
    const result = (service as any).identifyAutoIncludable([partialInterest], SUBJECT, VG_RATE);
    expect(result).toEqual([]);
  });

  it('includes an otherwise-identical candidate with interest_of_sale_percent: 0', () => {
    const wholeInterest = poolRow({ id: 'whole', interest_of_sale_percent: 0, purchase_price: 1500000 });
    const result = (service as any).identifyAutoIncludable([wholeInterest], SUBJECT, VG_RATE);
    expect(result.map((r: any) => r.id)).toEqual(['whole']);
  });

  it('excludes a candidate whose area is more than 30% smaller than the subject, even though it would otherwise support', () => {
    const tooSmall = poolRow({ id: 'too-small', area: 100, nature_of_property: 'V', primary_purpose: 'VACANT LAND', purchase_price: 300000 });
    const result = (service as any).identifyAutoIncludable([tooSmall], SUBJECT, VG_RATE);
    expect(result).toEqual([]);
  });

  it('excludes a candidate whose area is more than 30% larger than the subject, even though it would otherwise support', () => {
    const tooLarge = poolRow({ id: 'too-large', area: 1000, nature_of_property: 'V', primary_purpose: 'VACANT LAND', purchase_price: 2000000 });
    const result = (service as any).identifyAutoIncludable([tooLarge], SUBJECT, VG_RATE);
    expect(result).toEqual([]);
  });

  it('includes a candidate exactly at the ±30% size-band boundary', () => {
    const atLowerBound = poolRow({ id: 'lower-bound', area: 350, nature_of_property: 'V', primary_purpose: 'VACANT LAND', purchase_price: 500000 });
    const atUpperBound = poolRow({ id: 'upper-bound', area: 650, nature_of_property: 'V', primary_purpose: 'VACANT LAND', purchase_price: 900000 });
    const result = (service as any).identifyAutoIncludable([atLowerBound, atUpperBound], SUBJECT, VG_RATE);
    expect(result.map((r: any) => r.id).sort()).toEqual(['lower-bound', 'upper-bound']);
  });

  it('every returned item carries time_band and improvement_confidence', () => {
    const supporting = poolRow({ id: 'a', purchase_price: 1500000 });
    const result = (service as any).identifyAutoIncludable([supporting], SUBJECT, VG_RATE);
    expect(result[0].time_band).toBeDefined();
    expect(result[0].improvement_confidence).toBeDefined();
  });

  it('includes a widened-tier (30%-50% outside standard band) candidate when it is fresh and otherwise supports', () => {
    // area=680 is 36% larger than the 500m² subject — outside ±30% (preferred) but inside ±50% (widened).
    const widenedFresh = poolRow({ id: 'widened-fresh', area: 680, purchase_price: 2000000, contract_date: '2025-06-01' });
    const result = (service as any).identifyAutoIncludable([widenedFresh], SUBJECT, VG_RATE);
    expect(result.map((r: any) => r.id)).toEqual(['widened-fresh']);
    expect(result[0].size_tier).toBe('widened');
  });

  it('excludes a widened-tier candidate whose time_band is last_resort, even though it numerically supports', () => {
    // Same area as above (widened tier), but contract_date is 66 months old (>18mo -> last_resort).
    const widenedStale = poolRow({ id: 'widened-stale', area: 680, purchase_price: 2000000, contract_date: '2020-01-01' });
    const result = (service as any).identifyAutoIncludable([widenedStale], SUBJECT, VG_RATE);
    expect(result).toEqual([]);
  });

  it('still hard-excludes a candidate more than 50% outside the subject area, regardless of how fresh its date is', () => {
    // area=800 is 60% larger than the 500m² subject — outside even the widened ±50% ceiling.
    // Vacant land + fresh date so it would otherwise clearly support, isolating that size alone excludes it.
    const wayTooBig = poolRow({
      id: 'way-too-big', area: 800, purchase_price: 2000000, contract_date: '2025-06-01',
      nature_of_property: 'V', primary_purpose: 'VACANT LAND',
    });
    const result = (service as any).identifyAutoIncludable([wayTooBig], SUBJECT, VG_RATE);
    expect(result).toEqual([]);
  });

  it('tags size_tier correctly for a mixed batch of preferred and widened candidates', () => {
    const preferred = poolRow({ id: 'preferred-one', area: 500, purchase_price: 1500000, contract_date: '2025-06-01' });
    const widened = poolRow({ id: 'widened-one', area: 680, purchase_price: 2000000, contract_date: '2025-06-01' });
    const result = (service as any).identifyAutoIncludable([preferred, widened], SUBJECT, VG_RATE);
    const tierById = Object.fromEntries(result.map((r: any) => [r.id, r.size_tier]));
    expect(tierById['preferred-one']).toBe('preferred');
    expect(tierById['widened-one']).toBe('widened');
  });

  it("classifySizeTier's preferred/not-preferred boundary never disagrees with filterOutsideSizeBand's keep/drop decision", () => {
    const areas = [100, 250, 300, 349, 350, 500, 650, 651, 750, 800, 1000];
    const candidates = areas.map((area, i) => poolRow({ id: `parity-${i}`, area }));

    const keptIds = (service as any).filterOutsideSizeBand(candidates, SUBJECT).map((c: any) => c.id);

    for (const c of candidates) {
      const tier = (service as any).classifySizeTier(c, SUBJECT);
      expect(tier === 'preferred').toBe(keptIds.includes(c.id));
    }
  });
});

describe('ComparablesService — selectByTimeBandPreference', () => {
  let service: ComparablesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparablesService,
        { provide: getRepositoryToken(ComparableSale), useValue: {} },
        { provide: getRepositoryToken(DisputeCase), useValue: {} },
        { provide: getRepositoryToken(NswLocalityCentroid), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: SkillRegistryService, useValue: { getSkillContent: jest.fn() } },
        { provide: AnthropicService, useValue: { call: jest.fn(), parseJsonArray: jest.fn() } },
        { provide: GeocodingService, useValue: { geocode: jest.fn() } },
      ],
    }).compile();

    service = module.get<ComparablesService>(ComparablesService);
  });

  it('includes fresh-band candidates ahead of last-resort ones when fresh alone reaches target', () => {
    const fresh = Array.from({ length: 5 }, (_, i) => ({ id: `fresh-${i}`, time_band: 'fresh' }));
    const lastResort = Array.from({ length: 3 }, (_, i) => ({ id: `lr-${i}`, time_band: 'last_resort' }));
    const result = (service as any).selectByTimeBandPreference([...fresh, ...lastResort], 0, 5);
    expect(result).toHaveLength(5);
    expect(result.every((r: any) => r.time_band === 'fresh')).toBe(true);
  });

  it('falls through to last-resort in full when fresher bands do not reach target', () => {
    const fresh = Array.from({ length: 2 }, (_, i) => ({ id: `fresh-${i}`, time_band: 'fresh' }));
    const lastResort = Array.from({ length: 4 }, (_, i) => ({ id: `lr-${i}`, time_band: 'last_resort' }));
    const result = (service as any).selectByTimeBandPreference([...fresh, ...lastResort], 0, 5);
    expect(result).toHaveLength(6); // a band that tips the total over target is still included in full
  });

  it('returns everything when every candidate is last_resort (no fresh/recent/adjusted at all)', () => {
    const lastResort = Array.from({ length: 3 }, (_, i) => ({ id: `lr-${i}`, time_band: 'last_resort' }));
    const result = (service as any).selectByTimeBandPreference(lastResort, 0, 5);
    expect(result).toHaveLength(3);
  });

  it('accounts for currentTotal already reached in prior rounds', () => {
    const fresh = Array.from({ length: 3 }, (_, i) => ({ id: `fresh-${i}`, time_band: 'fresh' }));
    const result = (service as any).selectByTimeBandPreference(fresh, 5, 5);
    expect(result).toHaveLength(0);
  });

  it('walks every preferred-tier band before touching any widened-tier band, even when widened alone would reach target sooner', () => {
    const preferredRecent = Array.from({ length: 2 }, (_, i) => ({ id: `pref-recent-${i}`, time_band: 'recent', size_tier: 'preferred' }));
    const widenedFresh = Array.from({ length: 5 }, (_, i) => ({ id: `wide-fresh-${i}`, time_band: 'fresh', size_tier: 'widened' }));
    const result = (service as any).selectByTimeBandPreference([...widenedFresh, ...preferredRecent], 0, 2);
    expect(result.map((r: any) => r.id).sort()).toEqual(preferredRecent.map((r) => r.id).sort());
  });

  it('falls through to the widened tier before last_resort when preferred-tier evidence alone is short of target', () => {
    const preferredFresh = Array.from({ length: 2 }, (_, i) => ({ id: `pref-fresh-${i}`, time_band: 'fresh', size_tier: 'preferred' }));
    const widenedFresh = Array.from({ length: 3 }, (_, i) => ({ id: `wide-fresh-${i}`, time_band: 'fresh', size_tier: 'widened' }));
    const lastResort = Array.from({ length: 5 }, (_, i) => ({ id: `lr-${i}`, time_band: 'last_resort', size_tier: 'preferred' }));
    const result = (service as any).selectByTimeBandPreference([...preferredFresh, ...widenedFresh, ...lastResort], 0, 5);
    const ids = result.map((r: any) => r.id);
    expect([...preferredFresh, ...widenedFresh].every((r) => ids.includes(r.id))).toBe(true);
    expect(lastResort.every((r) => !ids.includes(r.id))).toBe(true);
    expect(result).toHaveLength(5); // 2 preferred-fresh + 3 widened-fresh reaches target exactly
  });

  it('never selects a last_resort + widened combination even if present in the input (no such rung exists)', () => {
    const staleWidened = Array.from({ length: 5 }, (_, i) => ({ id: `stale-wide-${i}`, time_band: 'last_resort', size_tier: 'widened' }));
    const result = (service as any).selectByTimeBandPreference(staleWidened, 0, 5);
    expect(result).toHaveLength(0);
  });

  it('includes a widened-tier rung in full even when it tips the total over target', () => {
    const preferredFresh = Array.from({ length: 2 }, (_, i) => ({ id: `pref-fresh-${i}`, time_band: 'fresh', size_tier: 'preferred' }));
    const widenedFresh = Array.from({ length: 4 }, (_, i) => ({ id: `wide-fresh-${i}`, time_band: 'fresh', size_tier: 'widened' }));
    const result = (service as any).selectByTimeBandPreference([...preferredFresh, ...widenedFresh], 0, 5);
    expect(result).toHaveLength(6); // 2 preferred + 4 widened = 6 — the widened rung isn't truncated
  });

  it('defaults candidates without an explicit size_tier to "preferred" (backward compatibility)', () => {
    const noTierFresh = Array.from({ length: 5 }, (_, i) => ({ id: `notier-fresh-${i}`, time_band: 'fresh' })); // no size_tier at all
    const widenedFresh = Array.from({ length: 5 }, (_, i) => ({ id: `wide-fresh-${i}`, time_band: 'fresh', size_tier: 'widened' }));
    const result = (service as any).selectByTimeBandPreference([...widenedFresh, ...noTierFresh], 0, 5);
    // fresh@preferred rung should be populated entirely from noTierFresh (defaulted), not widenedFresh
    expect(result.map((r: any) => r.id).sort()).toEqual(noTierFresh.map((r) => r.id).sort());
  });
});

describe('ComparablesService — computeEvidenceConfidence', () => {
  let service: ComparablesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparablesService,
        { provide: getRepositoryToken(ComparableSale), useValue: {} },
        { provide: getRepositoryToken(DisputeCase), useValue: {} },
        { provide: getRepositoryToken(NswLocalityCentroid), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: SkillRegistryService, useValue: { getSkillContent: jest.fn() } },
        { provide: AnthropicService, useValue: { call: jest.fn(), parseJsonArray: jest.fn() } },
        { provide: GeocodingService, useValue: { geocode: jest.fn() } },
      ],
    }).compile();

    service = module.get<ComparablesService>(ComparablesService);
  });

  const ideal = (id: string) => ({ id, time_band: 'fresh', zoning_confidence: 'same_family' });

  it('is "insufficient" when count is below minimum, regardless of how ideal the ratio is', () => {
    const selected = [ideal('a'), ideal('b')]; // 2 < minimum(3), 100% ideal
    const result = (service as any).computeEvidenceConfidence(selected, 5, 3);
    expect(result).toEqual({ tier: 'insufficient', idealRatio: 1, count: 2 });
  });

  it('is "strong" when count >= target and idealRatio >= the threshold', () => {
    const selected = Array.from({ length: 5 }, (_, i) => ideal(`a${i}`));
    const result = (service as any).computeEvidenceConfidence(selected, 5, 3);
    expect(result.tier).toBe('strong');
    expect(result.idealRatio).toBe(1);
  });

  it('is "adequate" (not "strong") when idealRatio falls below the threshold, even with count >= target', () => {
    const selected = [
      ...Array.from({ length: 3 }, (_, i) => ideal(`ideal${i}`)),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `weak${i}`, time_band: 'adjusted', zoning_confidence: 'same_family' })),
    ];
    const result = (service as any).computeEvidenceConfidence(selected, 5, 3);
    expect(result.tier).toBe('adequate');
    expect(result.idealRatio).toBe(0.6);
  });

  it('never reaches "strong" below target count, even with a 100% ideal ratio', () => {
    const selected = [ideal('a'), ideal('b'), ideal('c')]; // count=3 < target(5), 100% ideal
    const result = (service as any).computeEvidenceConfidence(selected, 5, 3);
    expect(result.tier).toBe('adequate');
    expect(result.idealRatio).toBe(1);
  });

  it('does not penalize a widened size_tier — only time_band and zoning_confidence count toward "ideal"', () => {
    const selected = Array.from({ length: 5 }, (_, i) => ({ id: `w${i}`, time_band: 'fresh', size_tier: 'widened', zoning_confidence: 'same_family' }));
    const result = (service as any).computeEvidenceConfidence(selected, 5, 3);
    expect(result.tier).toBe('strong');
    expect(result.idealRatio).toBe(1);
  });

  it('counts a different_class_last_resort zoning_confidence against "ideal"', () => {
    const selected = [
      ...Array.from({ length: 4 }, (_, i) => ideal(`ideal${i}`)),
      { id: 'zoning-weak', time_band: 'fresh', zoning_confidence: 'different_class_last_resort' },
    ];
    const result = (service as any).computeEvidenceConfidence(selected, 5, 3);
    expect(result.idealRatio).toBe(0.8);
    expect(result.tier).toBe('strong'); // 0.8 meets the threshold exactly — boundary is inclusive
  });

  it('defaults a missing zoning_confidence field to "same_family" (ideal) for backward compatibility', () => {
    const selected = Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, time_band: 'fresh' })); // no zoning_confidence at all
    const result = (service as any).computeEvidenceConfidence(selected, 5, 3);
    expect(result.tier).toBe('strong');
  });

  it('returns "insufficient" with a 0 ratio for an empty array (no divide-by-zero)', () => {
    const result = (service as any).computeEvidenceConfidence([], 5, 3);
    expect(result).toEqual({ tier: 'insufficient', idealRatio: 0, count: 0 });
  });
});

describe('ComparablesService — gatherRoundCandidates', () => {
  let service: ComparablesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparablesService,
        { provide: getRepositoryToken(ComparableSale), useValue: {} },
        { provide: getRepositoryToken(DisputeCase), useValue: {} },
        { provide: getRepositoryToken(NswLocalityCentroid), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: SkillRegistryService, useValue: { getSkillContent: jest.fn() } },
        { provide: AnthropicService, useValue: { call: jest.fn(), parseJsonArray: jest.fn() } },
        { provide: GeocodingService, useValue: { geocode: jest.fn() } },
      ],
    }).compile();

    service = module.get<ComparablesService>(ComparablesService);
  });

  it('never persists the same id twice when it is both auto-includable and separately returned by the LLM round', async () => {
    const supporting = poolRow({ id: 'dup', purchase_price: 1500000 });
    const nonAutoIncludable = poolRow({ id: 'needs-llm', zoning: 'R3', purchase_price: 1500000 });

    // Simulate Claude's MCP fallback re-surfacing the already-auto-included "dup" id alongside
    // a genuinely new supporting candidate it found on its own.
    jest.spyOn(service as any, 'runComparableRound').mockResolvedValue({
      enriched: [],
      supporting: [{ ...supporting, adjusted_rate_per_sqm: 1500 }, { id: 'new-from-llm', adjusted_rate_per_sqm: 1500 }],
    });

    const resolvedIds = new Set<string>();
    const result = await (service as any).gatherRoundCandidates(
      [supporting, nonAutoIncludable], SUBJECT, VG_RATE, 3, undefined, resolvedIds, undefined, 1,
    );

    const ids = result.map((r: any) => r.id);
    expect(ids.filter((id: string) => id === 'dup')).toHaveLength(1);
    expect(ids).toContain('new-from-llm');
    expect(resolvedIds.has('dup')).toBe(true);
    expect(resolvedIds.has('new-from-llm')).toBe(true);
  });

  it('excludes already-auto-included candidates from the pool sent to the LLM round', async () => {
    const supporting = poolRow({ id: 'auto', purchase_price: 1500000 });
    const needsLlm = poolRow({ id: 'llm-only', zoning: 'R3', purchase_price: 1500000 });

    const runComparableRoundSpy = jest.spyOn(service as any, 'runComparableRound').mockResolvedValue({
      enriched: [], supporting: [],
    });

    await (service as any).gatherRoundCandidates(
      [supporting, needsLlm], SUBJECT, VG_RATE, 3, undefined, new Set<string>(), undefined, 1,
    );

    const llmPoolArg = runComparableRoundSpy.mock.calls[0][0] as Record<string, unknown>[];
    expect(llmPoolArg.map((r: any) => r.id)).toEqual(['llm-only']);
  });

  it('returns the full unfiltered union of auto-includable fresh and last-resort candidates — selection/ranking is deferred to the caller', async () => {
    const freshRows = Array.from({ length: 5 }, (_, i) => poolRow({ id: `fresh-${i}`, contract_date: '2025-01-01', purchase_price: 1500000 + i }));
    const lastResortRows = Array.from({ length: 3 }, (_, i) => poolRow({ id: `lr-${i}`, contract_date: '2023-01-01', purchase_price: 1500000 + i }));

    const runComparableRoundSpy = jest.spyOn(service as any, 'runComparableRound').mockResolvedValue({ enriched: [], supporting: [] });

    const result = await (service as any).gatherRoundCandidates(
      [...freshRows, ...lastResortRows], SUBJECT, VG_RATE, 3, undefined, new Set<string>(), undefined, 1,
    );

    const ids = result.map((r: any) => r.id);
    expect(freshRows.every((r) => ids.includes(r.id))).toBe(true);
    expect(lastResortRows.every((r) => ids.includes(r.id))).toBe(true); // no rung-based truncation at this layer anymore

    // Every auto-includable candidate is immediately resolved (not just ones a rung would pick),
    // so none of them are re-offered to the LLM either.
    const llmPoolArg = runComparableRoundSpy.mock.calls[0][0] as Record<string, unknown>[];
    expect([...freshRows, ...lastResortRows].every((r) => !llmPoolArg.some((c: any) => c.id === r.id))).toBe(true);
  });

  it('populates resolvedIds for every auto-includable candidate immediately, regardless of time_band', async () => {
    const allOld = Array.from({ length: 4 }, (_, i) => poolRow({ id: `old-${i}`, contract_date: '2023-01-01', purchase_price: 1500000 + i }));

    jest.spyOn(service as any, 'runComparableRound').mockResolvedValue({ enriched: [], supporting: [] });

    const resolvedIds = new Set<string>();
    const result = await (service as any).gatherRoundCandidates(
      allOld, SUBJECT, VG_RATE, 3, undefined, resolvedIds, undefined, 1,
    );

    expect(result).toHaveLength(4);
    expect(allOld.every((r) => resolvedIds.has(r.id as string))).toBe(true);
  });
});

describe('ComparablesService — runComparableRound (zoning last-resort bypass)', () => {
  let service: ComparablesService;
  let anthropic: { call: jest.Mock; parseJsonArray: jest.Mock };

  beforeEach(async () => {
    anthropic = { call: jest.fn(), parseJsonArray: jest.fn((t: string) => JSON.parse(t)) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparablesService,
        { provide: getRepositoryToken(ComparableSale), useValue: {} },
        { provide: getRepositoryToken(DisputeCase), useValue: {} },
        { provide: getRepositoryToken(NswLocalityCentroid), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: SkillRegistryService, useValue: { getSkillContent: jest.fn() } },
        { provide: AnthropicService, useValue: anthropic },
        { provide: GeocodingService, useValue: { geocode: jest.fn() } },
      ],
    }).compile();

    service = module.get<ComparablesService>(ComparablesService);
  });

  function llmPick(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id, adjusted_rate_per_sqm: null, adjusted_land_value: null, suggested_land_value: null,
      explanation: null, zoning_justification: null, ...overrides,
    };
  }

  it('drops a different-zoning-class pick even in last-resort mode when it lacks a zoning_justification', async () => {
    // B1 vs subject's R1 — a different zoning family, not just a different subtype.
    const differentClass = poolRow({ id: 'diff-class', zoning: 'B1', purchase_price: 1000000 });
    anthropic.call.mockResolvedValue({
      text: JSON.stringify([llmPick('diff-class')]), // zoning_justification left null
      stopReason: 'end_turn', usage: {},
    });

    const result = await (service as any).runComparableRound([differentClass], SUBJECT, VG_RATE, 3, undefined, undefined, true);

    expect(result.supporting).toEqual([]);
  });

  it('includes a different-zoning-class pick in last-resort mode when it has a zoning_justification, tagged zoning_confidence: different_class_last_resort', async () => {
    const differentClass = poolRow({ id: 'diff-class', zoning: 'B1', purchase_price: 1000000 });
    anthropic.call.mockResolvedValue({
      text: JSON.stringify([llmPick('diff-class', { zoning_justification: 'Same permitted commercial uses as the subject despite the differing zoning code.' })]),
      stopReason: 'end_turn', usage: {},
    });

    const result = await (service as any).runComparableRound([differentClass], SUBJECT, VG_RATE, 3, undefined, undefined, true);

    expect(result.supporting.map((r: any) => r.id)).toEqual(['diff-class']);
    expect(result.supporting[0].zoning_confidence).toBe('different_class_last_resort');
  });

  it('excludes the same different-zoning-class pick when zoningLastResort is false (default), even with a justification', async () => {
    const differentClass = poolRow({ id: 'diff-class', zoning: 'B1', purchase_price: 1000000 });
    anthropic.call.mockResolvedValue({
      text: JSON.stringify([llmPick('diff-class', { zoning_justification: 'Same permitted commercial uses.' })]),
      stopReason: 'end_turn', usage: {},
    });

    const result = await (service as any).runComparableRound([differentClass], SUBJECT, VG_RATE, 3, undefined, undefined);

    expect(result.supporting).toEqual([]);
  });
});

describe('ComparablesService — generateComparableSales', () => {
  let service: ComparablesService;
  let disputeCasesRepo: { findOne: jest.Mock };
  let comparablesRepo: { create: jest.Mock; save: jest.Mock };
  let dataSource: { query: jest.Mock };
  let anthropic: { call: jest.Mock; parseJsonArray: jest.Mock };
  let geocoding: { geocode: jest.Mock };
  let centroidsRepo: { upsert: jest.Mock };

  const DTO = {
    dispute_case_id: 'case-1',
    vg_land_value_current: SUBJECT.vgValueCurrent,
    land_area_sqm: SUBJECT.landAreaSqm,
    zoning: SUBJECT.zoning,
    suburb: SUBJECT.suburb,
    postcode: SUBJECT.postcode,
    lat: SUBJECT.lat,
    lng: SUBJECT.lng,
    valuation_date: SUBJECT.valuationDate,
  };

  beforeEach(async () => {
    disputeCasesRepo = { findOne: jest.fn().mockResolvedValue({ id: 'case-1', property: null, valuation_notice: null }) };
    comparablesRepo = {
      create: jest.fn((x) => x),
      save: jest.fn((rows) => Promise.resolve(rows.map((r: any, i: number) => ({ ...r, id: `saved-${i}` })))),
    };
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    anthropic = { call: jest.fn().mockResolvedValue({ text: '[]', stopReason: 'end_turn', usage: {} }), parseJsonArray: jest.fn((t: string) => JSON.parse(t)) };
    geocoding = { geocode: jest.fn().mockResolvedValue({ lat: SUBJECT.lat, lng: SUBJECT.lng }) };
    centroidsRepo = { upsert: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparablesService,
        { provide: getRepositoryToken(ComparableSale), useValue: comparablesRepo },
        { provide: getRepositoryToken(DisputeCase), useValue: disputeCasesRepo },
        { provide: getRepositoryToken(NswLocalityCentroid), useValue: centroidsRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: SkillRegistryService, useValue: { getSkillContent: jest.fn() } },
        { provide: AnthropicService, useValue: anthropic },
        { provide: GeocodingService, useValue: geocoding },
      ],
    }).compile();

    service = module.get<ComparablesService>(ComparablesService);
  });

  it('reaches MINIMUM_COMPARABLES via auto-include alone, without the LLM ever being called', async () => {
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('UPPER(property_locality) =')) {
        return Promise.resolve([
          poolRow({ id: 'a', purchase_price: 1500000, contract_date: '2025-01-01' }),
          poolRow({ id: 'b', purchase_price: 1600000, contract_date: '2025-02-01' }),
          poolRow({ id: 'c', purchase_price: 1300000, contract_date: '2025-03-01' }),
        ]);
      }
      return Promise.resolve([]);
    });

    const saved = await service.generateComparableSales(DTO as any, 'user-1');

    expect(saved.length).toBeGreaterThanOrEqual(3);
    expect(anthropic.call).not.toHaveBeenCalled();
  });

  it('widens up to the round cap (3), and the ranked last-resort tier still rescues the one candidate that auto-include/LLM selection both missed', async () => {
    // Despite the name, this row's underlying economics are strong (exact 500m² size match,
    // same "R" zoning family as the subject, fresh sale, rate well under vgRate) — it's excluded
    // from every NORMAL path only because auto-include requires an EXACT zoning match (R3 !== R1)
    // and the mocked LLM below never selects anything at all. The ranked last-resort tier depends
    // on neither of those, so it correctly finds this candidate once the case is still short of
    // MINIMUM_COMPARABLES after every hard-gated round (see selectRankedLastResortCandidates).
    const nonAutoIncludableRow = poolRow({ id: 'never-supports', zoning: 'R3', purchase_price: 1500000 });
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('UPPER(property_locality) =') || sql.includes('property_post_code LIKE $1')) {
        return Promise.resolve([nonAutoIncludableRow]);
      }
      return Promise.resolve([]);
    });
    anthropic.call.mockResolvedValue({ text: '[]', stopReason: 'end_turn', usage: {} });

    const prefetchBroadSpy = jest.spyOn(service as any, 'prefetchBroadCandidateSales');
    const logSpy = jest.spyOn(service as any, 'logEvent');

    const saved = await service.generateComparableSales(DTO as any, 'user-1');

    expect(saved.length).toBe(1);
    expect(saved[0].sale_id).toBe('never-supports');
    expect(prefetchBroadSpy).toHaveBeenCalledTimes(2);
    expect(prefetchBroadSpy.mock.calls[1][3]).toBe(7); // round 3's extended lookbackYears
    // Only round 1 ever reaches the LLM. This mock returns the SAME row (same dealing_number) for
    // every round's SQL pattern — a stand-in for a multi-lot sale resurfacing across broadened
    // tiers — and excludeSeenDealingNumbers correctly excludes it from rounds 2/3/zoning-last-resort
    // before their (empty) pools ever reach gatherRoundCandidates, since the underlying transaction
    // was already considered in round 1. Rounds still run (prefetchBroadSpy above confirms it), they
    // just have nothing left to send to the LLM.
    expect(anthropic.call).toHaveBeenCalledTimes(1);
    // Still logged as insufficient (1 < MINIMUM_COMPARABLES=3) even though the ranked last-resort
    // tier found one candidate — that tier fills gaps, it doesn't guarantee reaching the floor.
    expect(logSpy).toHaveBeenCalledWith(
      'GENERATE.insufficient_evidence_after_widening',
      expect.objectContaining({ finalCount: 1, minimumRequired: 3, roundsRun: 3 }),
    );
  });

  it('propagates an LLM call failure instead of silently degrading to auto-include only', async () => {
    const nonAutoIncludableRow = poolRow({ id: 'needs-llm', zoning: 'R3', purchase_price: 1500000 });
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('UPPER(property_locality) =')) return Promise.resolve([nonAutoIncludableRow]);
      return Promise.resolve([]);
    });
    anthropic.call.mockRejectedValue(new Error('anthropic is down'));

    await expect(service.generateComparableSales(DTO as any, 'user-1')).rejects.toThrow('anthropic is down');
  });

  it('confirms real "preserve" examples survive gating and "exclude" examples are size-band gated (Kensington scenario)', async () => {
    const kensingtonDto = {
      dispute_case_id: 'case-1',
      vg_land_value_current: 1833333, // vgRate = 1,833,333 / 445 ≈ 4,120/m²
      land_area_sqm: 445,
      zoning: 'R1',
      suburb: 'KENSINGTON',
      postcode: '2033',
      // Matches the outer beforeEach's geocode mock (fixed return value regardless of input) so
      // candidates don't appear artificially far away and get dropped by the distance filter.
      lat: SUBJECT.lat,
      lng: SUBJECT.lng,
      valuation_date: '2025-07-01',
    };

    // Real examples flagged as "must be preserved" — 50 Balfour Rd (337.8m², 5 years old, but
    // within the ±30% size band and the only same-suburb/district/component match) and 8 Callan
    // St Rozelle (442.6m², an almost-exact size match). Both auto-include via exact zoning match,
    // leaving the case at 2/3 of MINIMUM_COMPARABLES.
    const balfourRd = poolRow({ id: 'balfour', area: 337.8, purchase_price: 2305000, contract_date: '2020-07-05', property_locality: 'KENSINGTON' });
    const callanSt = poolRow({ id: 'callan', area: 442.6, purchase_price: 1800000, contract_date: '2025-01-01', property_locality: 'KENSINGTON' });
    // 3 Perrett St (157m², 65% smaller) and 43 Johnston St (1264m², 184% larger) both sit outside
    // the ±30% size band, so neither auto-includes or clears the LLM-path's hard gate. With only
    // 2 auto-included above, the case is still short of MINIMUM_COMPARABLES, so the ranked
    // last-resort tier kicks in and rescues exactly one more to fill the gap — Perrett (65%
    // smaller) is the closer match of the two and gets rescued; Johnston (184% larger, a strictly
    // worse match) is correctly still excluded since only one more slot was needed.
    const perrettSt = poolRow({ id: 'perrett', area: 157, purchase_price: 800000, contract_date: '2025-01-01', property_locality: 'KENSINGTON' });
    const johnstonSt = poolRow({ id: 'johnston', area: 1264, purchase_price: 4000000, contract_date: '2025-01-01', property_locality: 'KENSINGTON' });

    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('UPPER(property_locality) =')) {
        return Promise.resolve([balfourRd, callanSt, perrettSt, johnstonSt]);
      }
      return Promise.resolve([]);
    });

    const saved = await service.generateComparableSales(kensingtonDto as any, 'user-1');
    const savedSaleIds = saved.map((s: any) => s.sale_id);

    expect(savedSaleIds).toEqual(expect.arrayContaining(['balfour', 'callan', 'perrett']));
    expect(savedSaleIds).not.toEqual(expect.arrayContaining(['johnston']));
  });

  it('prefers widened-size but date-fresh candidates over a same-size but stale (last_resort) one, once fresh evidence alone reaches TARGET_COMPARABLES', async () => {
    // 5 same-suburb candidates 36% larger than the 500m² subject (outside ±30% preferred, inside
    // ±50% widened) but fresh (0-6mo) — exactly reaches TARGET_COMPARABLES (5) on its own.
    const widenedFreshRows = Array.from({ length: 5 }, (_, i) =>
      poolRow({ id: `wide-fresh-${i}`, area: 680, purchase_price: 2000000 + i, contract_date: '2025-06-01' }),
    );
    // Same size as the subject (preferred tier) but 78 months old (last_resort) — should not be
    // needed once the widened-fresh evidence above already reaches target.
    const staleSameSize = poolRow({ id: 'stale-same-size', area: 500, purchase_price: 1500000, contract_date: '2019-01-01' });

    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('UPPER(property_locality) =')) {
        return Promise.resolve([...widenedFreshRows, staleSameSize]);
      }
      return Promise.resolve([]);
    });

    const saved = await service.generateComparableSales(DTO as any, 'user-1');
    const savedIds = saved.map((s: any) => s.sale_id);

    expect(widenedFreshRows.every((r) => savedIds.includes(r.id))).toBe(true);
    expect(savedIds).not.toContain('stale-same-size');
    expect(anthropic.call).not.toHaveBeenCalled();
  });

  it('reaches "strong" confidence in round 1 alone and never widens further or invokes the LLM (early-exit cost-control guard)', async () => {
    const strongRows = Array.from({ length: 5 }, (_, i) =>
      poolRow({ id: `strong-${i}`, purchase_price: 1500000 + i, contract_date: '2025-06-01' }),
    );
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('UPPER(property_locality) =')) return Promise.resolve(strongRows);
      return Promise.resolve([]);
    });

    const prefetchBroadSpy = jest.spyOn(service as any, 'prefetchBroadCandidateSales');
    const prefetchZoningLastResortSpy = jest.spyOn(service as any, 'prefetchZoningLastResortCandidates');

    const saved = await service.generateComparableSales(DTO as any, 'user-1');

    expect(saved.length).toBe(5);
    expect(prefetchBroadSpy).not.toHaveBeenCalled();
    expect(prefetchZoningLastResortSpy).not.toHaveBeenCalled();
    expect(anthropic.call).not.toHaveBeenCalled();
  });

  it("lets a later round's stronger (fresh) evidence fully displace an earlier round's weaker (last_resort) picks in the final selection", async () => {
    // Round 1 (Tier 1, same suburb): 5 exact-zoning, supporting candidates, all >18 months old
    // (last_resort band) — reaches TARGET_COMPARABLES(5) but with idealRatio=0, so confidence is
    // 'adequate', not 'strong', and widening continues instead of locking these in permanently.
    const staleRows = Array.from({ length: 5 }, (_, i) =>
      poolRow({ id: `stale-${i}`, purchase_price: 1500000 + i, contract_date: '2020-01-01' }),
    );
    // Round 3 (postcode-prefix broad query, 7yr lookback): 5 fresh, supporting candidates —
    // fresh@preferred is walked before last_resort@preferred in SELECTION_RUNGS, so these alone
    // reach target first and the stale round-1 picks never make it into the final selection.
    const freshRows = Array.from({ length: 5 }, (_, i) =>
      poolRow({ id: `fresh-${i}`, purchase_price: 1500000 + i, contract_date: '2025-06-01' }),
    );

    // Tier 3 (part of round 1) and round 2/3's broad queries all share the same
    // `property_post_code LIKE $1` SQL shape (only the bound date-range parameters differ) — key
    // off call order to make round 3 specifically the one that supplies the fresh rescue set: the
    // 1st such call is Tier 3 (round 1, wants no extra rows), the 2nd is round 2 (wants none), the
    // 3rd is round 3 (wants the fresh rows).
    let likeCallCount = 0;
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('UPPER(property_locality) =')) return Promise.resolve(staleRows); // Tier 1
      if (sql.includes('property_post_code LIKE $1')) {
        likeCallCount++;
        return Promise.resolve(likeCallCount >= 3 ? freshRows : []);
      }
      return Promise.resolve([]); // Tier 2 (exact postcode match)
    });

    const saved = await service.generateComparableSales(DTO as any, 'user-1');
    const savedIds = saved.map((s: any) => s.sale_id);

    expect(savedIds.sort()).toEqual(freshRows.map((r) => r.id).sort());
    expect(staleRows.every((r) => !savedIds.includes(r.id))).toBe(true);
    expect(anthropic.call).not.toHaveBeenCalled(); // every candidate here is an exact-zoning auto-include
  });

  it('caps the final persisted count at MAX_PERSISTED_COMPARABLES even when a single rung alone would exceed it', async () => {
    // 10 exact-zoning, same-day, supporting candidates — all land in the same fresh:preferred
    // rung, which selectByTimeBandPreference includes in full once entered (no mid-rung
    // truncation). Without a final cap, all 10 would be persisted.
    const manyFreshRows = Array.from({ length: 10 }, (_, i) =>
      poolRow({ id: `fresh-${i}`, purchase_price: 1500000 + i, contract_date: '2025-06-01' }),
    );
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('UPPER(property_locality) =')) return Promise.resolve(manyFreshRows);
      return Promise.resolve([]);
    });

    const saved = await service.generateComparableSales(DTO as any, 'user-1');
    const savedIds = saved.map((s: any) => s.sale_id).sort();

    expect(saved.length).toBe(8); // MAX_PERSISTED_COMPARABLES
    // The cap keeps the first 8 in rung order (all candidates here are in the same rung and
    // equally "best", so any 8 of the 10 satisfies the ordering guarantee) — assert it's a real
    // subset of the 10 gathered candidates, not something unrelated.
    expect(savedIds.every((id: string) => manyFreshRows.some((r) => r.id === id))).toBe(true);
  });
});
