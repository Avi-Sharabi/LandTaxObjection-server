import { ValuationReportService } from './valuation-report.service';
import { ValuationReportRepository } from './valuation-report.repository';
import { AnthropicService } from 'src/ai/anthropic.service';
import { SkillRegistryService } from 'src/mcp/skill-registry.service';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { AssessmentDocumentsService } from '../assessment-documents/assessment-documents.service';
import { PuppeteerService } from '../supporting-evidence/shared/puppeteer.service';
import { ValuationCtxCacheService } from './valuation-ctx-cache.service';
import { DisputeCase, DisputeStatus } from './entities/dispute-case.entity';
import { ComparableSale } from '../comparables/entities/comparable-sale.entity';
import { Property } from '../properties/entities/property.entity';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';

// The real template/HTML rendering is exercised by manual/E2E verification (see the
// Issues-3-7 plan) — mocked here so this suite stays focused on the median/quarantine
// arithmetic in ValuationReportService.generate() rather than template implementation details.
jest.mock('nunjucks', () => ({
  renderString: jest.fn().mockReturnValue('<html>mock report</html>'),
}));

const CASE_ID = 'case-1';
const SITE_AREA_SQM = 500;

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    address: '1 Test St, Testville NSW 2000',
    pid: 'PID-1',
    lot_dp: '1/DP12345',
    land_area_sqm: SITE_AREA_SQM,
    land_area_eplanning_sqm: SITE_AREA_SQM,
    zoning: 'R1',
    height_limit_m: null,
    ...overrides,
  } as Property;
}

function makeValuationNotice(overrides: Partial<ValuationNotice> = {}): ValuationNotice {
  return {
    valuation_date: new Date('2024-07-01'),
    assessed_land_value: 1500000,
    notice_issue_date: new Date('2024-01-01'),
    prior_land_value: null,
    land_value_2yr_prior: null,
    ownership_type: null,
    benchmark_uplift_pct: null,
    appraised_value: null,
    ...overrides,
  } as ValuationNotice;
}

function makeDisputeCase(overrides: Partial<DisputeCase> = {}): DisputeCase {
  return {
    id: CASE_ID,
    case_reference: 'CASE-0001',
    status: DisputeStatus.DRAFT,
    statutory_deadline: new Date('2025-01-01'),
    client_id: 'client-1',
    flag_heritage: false,
    flag_flood_zone: false,
    flag_zoning: false,
    flag_easement: false,
    flag_environmental: false,
    property: makeProperty(),
    valuation_notice: makeValuationNotice(),
    ...overrides,
  } as DisputeCase;
}

let compId = 0;
function makeComparable(overrides: Partial<ComparableSale> = {}): ComparableSale {
  compId += 1;
  return {
    id: `comp-${compId}`,
    property_house_number: '1',
    property_street_name: 'Test St',
    property_locality: 'Testville',
    area: 500,
    zoning: 'R1',
    contract_date: new Date('2024-06-01'),
    purchase_price: 1000000,
    adjusted_land_value: 1000000,
    adjusted_rate_per_sqm: 2000,
    interest_of_sale_percent: 0,
    ...overrides,
  } as ComparableSale;
}

function makeServiceHarness() {
  const repository = {
    findDisputeCaseWithRelations: jest.fn().mockResolvedValue(makeDisputeCase()),
    getComparables: jest.fn().mockResolvedValue([]),
    getLatestEvidenceIssues: jest.fn().mockResolvedValue([]),
    getLatestObjectionReasons: jest.fn().mockResolvedValue([]),
    updateAnalysisReportPath: jest.fn().mockResolvedValue(undefined),
    updateInternalAssessedValue: jest.fn().mockResolvedValue(undefined),
  };
  const anthropicService = {
    call: jest.fn().mockResolvedValue({ text: '```json\n{}\n```', stopReason: 'end_turn', usage: {} }),
    parseJsonObject: jest.fn().mockReturnValue({}),
  };
  const skillRegistry = { getSkillContent: jest.fn().mockReturnValue('skill content') };
  const azureBlobService = { uploadFile: jest.fn().mockResolvedValue('analysis-reports/case-1/valuation-report.pdf') };
  const assessmentDocumentsService = { createArtifactRecord: jest.fn().mockResolvedValue(undefined) };
  const fakePage = {
    setContent: jest.fn().mockResolvedValue(undefined),
    pdf: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const fakeBrowser = {
    newPage: jest.fn().mockResolvedValue(fakePage),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const puppeteerService = { launchForPdf: jest.fn().mockResolvedValue(fakeBrowser) };
  const ctxCacheService = { get: jest.fn().mockResolvedValue(null), save: jest.fn() };

  const service = new ValuationReportService(
    repository as unknown as ValuationReportRepository,
    anthropicService as unknown as AnthropicService,
    skillRegistry as unknown as SkillRegistryService,
    azureBlobService as unknown as AzureBlobService,
    assessmentDocumentsService as unknown as AssessmentDocumentsService,
    puppeteerService as unknown as PuppeteerService,
    ctxCacheService as unknown as ValuationCtxCacheService,
  );

  return { service, repository, azureBlobService };
}

describe('ValuationReportService.generate — comparable median aggregation (Issue 6/7)', () => {
  beforeEach(() => {
    compId = 0;
  });

  it('computes contendedValue from the median of only the eligible (full-interest, non-outlier) comparables', async () => {
    const { service, repository, azureBlobService } = makeServiceHarness();

    // Same rate set as comparable-quarantine.util.spec.ts's hand-verified IQR fence
    // ([1860, 2260], Q1=2010, Q3=2110): 9800 is a statistical outlier, and the part-interest
    // sale is hard-excluded outright regardless of its rate.
    const eligible = [1980, 2010, 2054, 2110].map(rate => makeComparable({ adjusted_rate_per_sqm: rate }));
    const outlier = makeComparable({ adjusted_rate_per_sqm: 9800 });
    const partInterest = makeComparable({ adjusted_rate_per_sqm: 500, interest_of_sale_percent: 50 });
    repository.getComparables.mockResolvedValue([...eligible, outlier, partInterest]);

    await service.generate(CASE_ID);

    // median([1980, 2010, 2054, 2110]) = (2010 + 2054) / 2 = 2032; site area 500m².
    expect(repository.updateInternalAssessedValue).toHaveBeenCalledWith(CASE_ID, 2032 * SITE_AREA_SQM);
    expect(azureBlobService.uploadFile).toHaveBeenCalled();
  });

  it('resolves contendedValue to null, not 0, when there are no comparables at all', async () => {
    const { service, repository } = makeServiceHarness();
    repository.getComparables.mockResolvedValue([]);

    await service.generate(CASE_ID);

    expect(repository.updateInternalAssessedValue).toHaveBeenCalledWith(CASE_ID, null);
  });

  it('resolves contendedValue to null, not 0, when every comparable is quarantined (all part-interest)', async () => {
    const { service, repository } = makeServiceHarness();
    const allPartInterest = [1980, 2010, 2054].map(rate =>
      makeComparable({ adjusted_rate_per_sqm: rate, interest_of_sale_percent: 50 }),
    );
    repository.getComparables.mockResolvedValue(allPartInterest);

    await service.generate(CASE_ID);

    expect(repository.updateInternalAssessedValue).toHaveBeenCalledWith(CASE_ID, null);
  });
});
