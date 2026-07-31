import * as nunjucks from 'nunjucks';
import { EvidenceScoreReportService } from './evidence-score-report.service';
import { EvidenceSnapshotService, EvidenceSnapshotInputs } from './evidence-snapshot.service';
import { ValuationReportRepository } from './valuation-report.repository';
import { AnthropicService } from 'src/ai/anthropic.service';
import { SkillRegistryService } from 'src/mcp/skill-registry.service';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { AssessmentDocumentsService } from '../assessment-documents/assessment-documents.service';
import { PuppeteerService } from '../supporting-evidence/shared/puppeteer.service';
import { DisputeCase, DisputeStatus } from './entities/dispute-case.entity';
import { ComparableSale } from '../comparables/entities/comparable-sale.entity';
import { Property } from '../properties/entities/property.entity';
import { RECOMMENDATIONS_MARKER } from './evidence-rationale.util';

// Template rendering is exercised by report-pdf.util.spec (the artifact guard) and by manual
// verification of the PDF itself; mocked here so this suite stays on the deterministic layer — which
// figures reach the template, and which of them the model is allowed to influence.
jest.mock('nunjucks', () => ({
  renderString: jest.fn().mockReturnValue('<html>mock report</html>'),
}));

const CASE_ID = 'case-1';

const RATIONALE = [
  '(34) Comparables - Six vacant-land sales within 1.2 km on a stated land-only basis.',
  '(20) Reason For Objection - Ground 1 pleaded with a specific overstatement.',
  '(18) Supporting Evidence - Flood constraint corroborated by the s10.7 certificate.',
  '(10) Documents - Land Value Search and notice held; no CPV report obtained.',
  RECOMMENDATIONS_MARKER,
  '[+6] Supporting Evidence - Obtain the survey confirming the recorded area.',
  '[+4] Comparables - Add two post-valuation-date sales in the same zone.',
].join('\n');

function makeDisputeCase(overrides: Partial<DisputeCase> = {}): DisputeCase {
  return {
    id: CASE_ID,
    case_reference: 'CASE-0001',
    status: DisputeStatus.DRAFT,
    client_id: 'client-1',
    evidence_strength_score: 82,
    evidence_strength_rationale: RATIONALE,
    property: { address: '1 Test St, Testville NSW 2000' } as Property,
    ...overrides,
  } as DisputeCase;
}

function makeInputs(overrides: Partial<EvidenceSnapshotInputs> = {}): EvidenceSnapshotInputs {
  return {
    disputeCase: makeDisputeCase(),
    comparables: [{ id: 'comp-1' } as ComparableSale],
    issues: [],
    grounds: [],
    documents: { documents: [], eligible: [], skipped: [], classified: false },
    ...overrides,
  };
}

/** The model's JSON. Deliberately hostile in the fields the server is supposed to overwrite. */
const MODEL_OUTPUT = {
  key_finding: 'Four locality sales support the contended rate.',
  score: { value: 42, band_label: 'Weak' }, // must be ignored entirely
  dashboard: { intro: 'intro para', commentary: 'commentary para' },
  band_narrative: { what_it_means: ['para one'], out_of_scope: ['Not a probability.'] },
  inventory: {
    comparables_note: 'Two are part-interest transfers.',
    comparables: [{ ref: 'C1', address: '2 Test St', status: 'EXCLUDED — part-interest sale' }],
    grounds: [{ ground_number: '1', label: 'Value too high', verification_display: 'CONFIRMED' }],
    issues: [{ issue_type: 'Flooding', verification_display: 'AI-DETECTED — NOT YET VERIFIED' }],
    documents: [{ name: 'Land Value Search', status: 'READ', reason: 'Land value search' }],
  },
  group_deep_dives: [
    { label: 'Comparables', points_narrative: 'comparables prose', strengths: ['six sales'] },
    { label: 'Reason For Objection', points_narrative: 'grounds prose' },
    { label: 'Supporting Evidence', points_narrative: 'issues prose' },
    { label: 'Documents', points_narrative: 'documents prose' },
  ],
  gap_analysis: [{ group: 'Documents', missing: 'No CPV report', severity: 'MATERIAL' }],
  roadmap: [
    { priority: 1, how: 'Order a survey from a registered surveyor.', establishes: 'the true area' },
    { priority: 2, how: 'Search NSW LRS for recent sales.', establishes: 'rate corroboration' },
    { priority: 9, how: 'should be dropped', establishes: 'never issued' },
  ],
  projected: { narrative: 'projected prose' },
  disclaimer_paragraphs: ['Not advice.'],
};

function makeServiceHarness(
  inputs: EvidenceSnapshotInputs = makeInputs(),
  modelOutput: Record<string, unknown> = MODEL_OUTPUT,
) {
  const snapshot = {
    load: jest.fn().mockResolvedValue(inputs),
    hasScorableData: jest.fn().mockReturnValue(true),
    buildSnapshotMarkdown: jest.fn().mockReturnValue('## snapshot'),
    toNumberOrNull: (v: unknown) => (v === null || v === undefined ? null : Number(v)),
  };
  const anthropicService = {
    call: jest.fn().mockResolvedValue({ text: '```json\n{}\n```', stopReason: 'end_turn', usage: {} }),
    parseJsonObject: jest.fn().mockReturnValue(modelOutput),
  };
  const skillRegistry = { getSkillContent: jest.fn().mockReturnValue('skill content') };
  const azureBlobService = {
    uploadFile: jest.fn().mockResolvedValue(`analysis-reports/${CASE_ID}/evidence-score-report.pdf`),
  };
  const assessmentDocumentsService = {
    upsertArtifactRecord: jest.fn().mockResolvedValue(undefined),
    createArtifactRecord: jest.fn().mockResolvedValue(undefined),
  };
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
  const repository = { updateEvidenceReportPath: jest.fn().mockResolvedValue(undefined) };

  const service = new EvidenceScoreReportService(
    snapshot as unknown as EvidenceSnapshotService,
    anthropicService as unknown as AnthropicService,
    skillRegistry as unknown as SkillRegistryService,
    azureBlobService as unknown as AzureBlobService,
    assessmentDocumentsService as unknown as AssessmentDocumentsService,
    puppeteerService as unknown as PuppeteerService,
    repository as unknown as ValuationReportRepository,
  );

  // Silenced so the expected log paths do not fill the test output; assertions are on the render data.
  jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

  return {
    service,
    snapshot,
    anthropicService,
    azureBlobService,
    assessmentDocumentsService,
    puppeteerService,
    repository,
  };
}

/** The data handed to the template — where every deterministic fact must be observable. */
function renderData(): Record<string, any> {
  const renderString = nunjucks.renderString as jest.Mock;
  return renderString.mock.calls.at(-1)?.[1];
}

beforeEach(() => {
  (nunjucks.renderString as jest.Mock).mockClear();
});

describe('EvidenceScoreReportService.generate — the score is read, never re-derived', () => {
  it('renders the PERSISTED score and band, not anything the model echoed', async () => {
    const { service } = makeServiceHarness();

    await service.generate(CASE_ID);

    const data = renderData();
    expect(data.score.display).toBe('82 / 100');
    expect(data.score.band_label).toBe('Strong');
    expect(data.score.band_range_display).toBe('80-89');
    // The model said 42 / Weak. It must not appear anywhere.
    expect(JSON.stringify(data)).not.toContain('42 / 100');
    expect(data.score.band_label).not.toBe('Weak');
  });

  it('takes no EvidenceScoreService dependency, so a failed recompute cannot blank the report', () => {
    // Seven constructor parameters, none of them the scorer: the report renders the persisted row.
    expect(EvidenceScoreReportService.length).toBe(7);
  });

  it('does not request document bytes — the judgement is already made', async () => {
    const { service, snapshot } = makeServiceHarness();

    await service.generate(CASE_ID);

    expect(snapshot.load).toHaveBeenCalledWith(CASE_ID, { withDocumentBytes: false });
    expect(snapshot.buildSnapshotMarkdown).toHaveBeenCalledWith(expect.anything(), {
      documentsAttached: false,
    });
  });

  it('renders the breakdown table from the stored rationale, with each group share', async () => {
    const { service } = makeServiceHarness();

    await service.generate(CASE_ID);

    const rows = renderData().dashboard.rows;
    expect(rows.map((r: any) => r.label)).toEqual([
      'Comparables',
      'Reason For Objection',
      'Supporting Evidence',
      'Documents',
    ]);
    expect(rows.map((r: any) => r.points_display)).toEqual(['34', '20', '18', '10']);
    expect(rows[0].share_display).toBe('41.5%'); // 34/82
    expect(renderData().dashboard.sum_mismatch).toBe(false);
  });

  it('flags a stored breakdown that does not add up, without adjusting anything', async () => {
    const { service } = makeServiceHarness(
      makeInputs({ disputeCase: makeDisputeCase({ evidence_strength_score: 70 }) }),
    );

    await service.generate(CASE_ID);

    const data = renderData();
    expect(data.dashboard.sum_mismatch).toBe(true);
    expect(data.score.display).toBe('70 / 100'); // the headline stays authoritative
    expect(data.dashboard.rows.map((r: any) => r.points_display)).toEqual(['34', '20', '18', '10']);
  });

  it('renders "-" rather than NaN or Infinity for a group share when the score is 0', async () => {
    const { service } = makeServiceHarness(
      makeInputs({
        disputeCase: makeDisputeCase({
          evidence_strength_score: 0,
          evidence_strength_rationale: '(0) Comparables - No sales on file.',
        }),
      }),
    );

    await service.generate(CASE_ID);

    const row = renderData().dashboard.rows[0];
    expect(row.share_display).toBe('-');
    expect(row.share_pct).toBe(0);
    expect(row.points_class).toBe('txt-amber'); // a zero group is flagged, not reddened
  });

  it('falls back to prose for a legacy single-sentence rationale', async () => {
    const legacy = 'Strong comparable evidence but the constraint is unverified.';
    const { service } = makeServiceHarness(
      makeInputs({
        disputeCase: makeDisputeCase({ evidence_strength_rationale: legacy }),
      }),
    );

    await service.generate(CASE_ID);

    const data = renderData();
    expect(data.dashboard.rows).toEqual([]);
    expect(data.dashboard.prose).toBe(legacy);
  });
});

describe('EvidenceScoreReportService.generate — the not-yet-scorable variant', () => {
  it('never presents an absent score as zero, and lists the unmet prerequisites', async () => {
    // Nothing on file at all.
    const harness = makeServiceHarness(
      makeInputs({
        disputeCase: makeDisputeCase({
          evidence_strength_score: null,
          evidence_strength_rationale: null,
        }),
        comparables: [],
      }),
    );
    harness.snapshot.hasScorableData.mockReturnValue(false);

    await harness.service.generate(CASE_ID);

    const data = renderData();
    expect(data.score.not_scorable).toBe(true);
    expect(data.score.display).toBe('Not yet scored');
    expect(data.score.not_scorable_lead).toContain('not a score of zero');
    expect(data.prerequisites.map((p: any) => p.status)).toEqual(['NOT MET', 'NOT MET', 'NOT MET']);
    expect(data.projected.rows).toEqual([]);
  });

  it('says the assessment has not completed — not that evidence is absent — when the gate is open', async () => {
    const harness = makeServiceHarness(
      makeInputs({
        disputeCase: makeDisputeCase({
          evidence_strength_score: null,
          evidence_strength_rationale: null,
        }),
      }),
    );
    harness.snapshot.hasScorableData.mockReturnValue(true);

    await harness.service.generate(CASE_ID);

    const lead = renderData().score.not_scorable_lead;
    expect(lead).toContain('has not yet completed');
    expect(lead).not.toContain('not a score of zero');
  });

  it('still renders the scored variant when a score exists but the current data is thin', async () => {
    // The regression this guards: a case scored 82 last week whose comparables were since deleted must
    // still get its report, not a "nothing to assess" page.
    const harness = makeServiceHarness(makeInputs({ comparables: [], issues: [], grounds: [] }));
    harness.snapshot.hasScorableData.mockReturnValue(false);

    await harness.service.generate(CASE_ID);

    expect(renderData().score.not_scorable).toBe(false);
    expect(renderData().score.display).toBe('82 / 100');
  });
});

describe('EvidenceScoreReportService.generate — the roadmap join', () => {
  it('renders the stored action, group and lift, never the model\'s version of them', async () => {
    const { service } = makeServiceHarness();

    await service.generate(CASE_ID);

    const roadmap = renderData().roadmap;
    expect(roadmap).toHaveLength(2);
    expect(roadmap[0]).toEqual({
      priority: 1,
      group: 'Supporting Evidence',
      action: 'Obtain the survey confirming the recorded area.',
      lift_display: '+6',
      how: 'Order a survey from a registered surveyor.',
      establishes: 'the true area',
    });
    expect(roadmap[1].lift_display).toBe('+4');
  });

  it('drops a model row whose priority was never issued', async () => {
    const { service } = makeServiceHarness();

    await service.generate(CASE_ID);

    expect(renderData().roadmap.map((r: any) => r.priority)).toEqual([1, 2]);
  });

  it('still renders a stored item the model skipped, with no how/establishes', async () => {
    const { service } = makeServiceHarness(makeInputs(), { ...MODEL_OUTPUT, roadmap: [] });

    await service.generate(CASE_ID);

    const roadmap = renderData().roadmap;
    expect(roadmap).toHaveLength(2);
    expect(roadmap[0].action).toBe('Obtain the survey confirming the recorded area.');
    expect(roadmap[0].how).toBeUndefined();
  });

  it('projects the score from the stored lifts and reports the band change', async () => {
    const { service } = makeServiceHarness();

    await service.generate(CASE_ID);

    const rows = renderData().projected.rows;
    expect(rows).toEqual(
      expect.arrayContaining([
        { label: 'Total estimated lift if every action is completed', value: '+10' },
        { label: 'Projected evidence score', value: '92 / 100' },
        { label: 'Projected band', value: 'Exceptional' },
      ]),
    );
  });

  it('caps the projected score at 100', async () => {
    const { service } = makeServiceHarness(
      makeInputs({
        disputeCase: makeDisputeCase({
          evidence_strength_score: 95,
          evidence_strength_rationale: `(95) Comparables - x\n${RECOMMENDATIONS_MARKER}\n[+20] Comparables - Add sales.`,
        }),
      }),
    );

    await service.generate(CASE_ID);

    expect(renderData().projected.rows).toEqual(
      expect.arrayContaining([{ label: 'Projected evidence score', value: '100 / 100' }]),
    );
  });

  it('distinguishes "a run found nothing left" from "no run has produced any"', async () => {
    const found = makeServiceHarness(
      makeInputs({
        disputeCase: makeDisputeCase({
          evidence_strength_rationale: `(82) Comparables - x\nRecommendations: none`,
        }),
      }),
    );
    await found.service.generate(CASE_ID);
    expect(renderData().roadmap_empty_note).toContain('nothing further of material value');

    const never = makeServiceHarness(
      makeInputs({
        disputeCase: makeDisputeCase({ evidence_strength_rationale: '(82) Comparables - x' }),
      }),
    );
    await never.service.generate(CASE_ID);
    expect(renderData().roadmap_empty_note).toContain('No recommendations have been recorded');
  });
});

describe('EvidenceScoreReportService.generate — placeholder neutralisation', () => {
  // The highest-value test here. evidence-score.md documents "[address]", "TODO" and "{{ }}" as
  // patterns found in REAL case narratives, and findLeftoverArtifact() throws on any of them — so
  // without this, one stale placeholder in a stored rationale would make that case's report
  // un-generatable in perpetuity.
  it('neutralises artifact-guard patterns in the stored explanation and action', async () => {
    const { service } = makeServiceHarness(
      makeInputs({
        disputeCase: makeDisputeCase({
          evidence_strength_rationale: [
            '(82) Comparables - Sales near [ADDRESS] support the rate; TODO confirm area of {{ area }}.',
            RECOMMENDATIONS_MARKER,
            '[+6] Documents - Obtain the certificate for [ADDRESS].',
          ].join('\n'),
        }),
      }),
    );

    await service.generate(CASE_ID);

    const data = renderData();
    const serialised = JSON.stringify(data);
    expect(serialised).not.toContain('[ADDRESS]');
    expect(serialised).not.toContain('TODO');
    expect(serialised).not.toContain('{{ area }}');
    expect(data.dashboard.rows[0].explanation).toContain('(unfilled field)');
    expect(data.roadmap[0].action).toContain('(unfilled field)');
  });

  it('neutralises a legacy prose rationale too', async () => {
    const { service } = makeServiceHarness(
      makeInputs({
        disputeCase: makeDisputeCase({
          evidence_strength_rationale: 'Evidence at [ADDRESS] is thin.',
        }),
      }),
    );

    await service.generate(CASE_ID);

    expect(renderData().dashboard.prose).toBe('Evidence at (unfilled field) is thin.');
  });
});

describe('EvidenceScoreReportService.generate — output pipeline', () => {
  it('upserts the document row so a regeneration does not duplicate it in the Documents tab', async () => {
    const { service, assessmentDocumentsService, repository, azureBlobService } = makeServiceHarness();

    await service.generate(CASE_ID);

    expect(azureBlobService.uploadFile).toHaveBeenCalledWith(
      `analysis-reports/${CASE_ID}/evidence-score-report.pdf`,
      expect.any(String),
    );
    expect(assessmentDocumentsService.upsertArtifactRecord).toHaveBeenCalledWith(
      'client-1',
      'Evidence Score Report',
      `analysis-reports/${CASE_ID}/evidence-score-report.pdf`,
      CASE_ID,
    );
    expect(assessmentDocumentsService.createArtifactRecord).not.toHaveBeenCalled();
    expect(repository.updateEvidenceReportPath).toHaveBeenCalledWith(
      CASE_ID,
      `analysis-reports/${CASE_ID}/evidence-score-report.pdf`,
    );
  });

  it('retries the Claude call once and completes on the second attempt', async () => {
    const { service, anthropicService, azureBlobService } = makeServiceHarness();
    anthropicService.call
      .mockRejectedValueOnce(new Error('stream ended without producing a Message'))
      .mockResolvedValueOnce({ text: '```json\n{}\n```', stopReason: 'end_turn', usage: {} });

    await service.generate(CASE_ID);

    expect(anthropicService.call).toHaveBeenCalledTimes(2);
    expect(azureBlobService.uploadFile).toHaveBeenCalled();
  });

  it('writes nothing when both attempts fail', async () => {
    const { service, anthropicService, azureBlobService, assessmentDocumentsService, repository } =
      makeServiceHarness();
    anthropicService.call.mockRejectedValue(new Error('stream ended'));

    await expect(service.generate(CASE_ID)).rejects.toThrow('stream ended');

    expect(azureBlobService.uploadFile).not.toHaveBeenCalled();
    expect(assessmentDocumentsService.upsertArtifactRecord).not.toHaveBeenCalled();
    expect(repository.updateEvidenceReportPath).not.toHaveBeenCalled();
  });

  it('throws on a truncated response rather than delivering a partial report', async () => {
    const { service, anthropicService, azureBlobService } = makeServiceHarness();
    anthropicService.call.mockResolvedValue({ text: 'partial', stopReason: 'max_tokens', usage: {} });

    await expect(service.generate(CASE_ID)).rejects.toThrow('truncated');
    expect(azureBlobService.uploadFile).not.toHaveBeenCalled();
  });

  it('throws on an empty response', async () => {
    const { service, anthropicService } = makeServiceHarness();
    anthropicService.call.mockResolvedValue({ text: '', stopReason: 'end_turn', usage: {} });

    await expect(service.generate(CASE_ID)).rejects.toThrow('empty');
  });

  it('throws when the blob upload returns no path', async () => {
    const { service, azureBlobService, assessmentDocumentsService } = makeServiceHarness();
    azureBlobService.uploadFile.mockResolvedValue(null);

    await expect(service.generate(CASE_ID)).rejects.toThrow('null path');
    expect(assessmentDocumentsService.upsertArtifactRecord).not.toHaveBeenCalled();
  });

  it('closes the browser even when the render throws', async () => {
    const { service, puppeteerService } = makeServiceHarness();
    const browser = await puppeteerService.launchForPdf();
    browser.newPage.mockRejectedValueOnce(new Error('renderer crashed'));

    await expect(service.generate(CASE_ID)).rejects.toThrow('renderer crashed');
    expect(browser.close).toHaveBeenCalled();
  });
});

describe('EvidenceScoreReportService.generate — model-authored inventory', () => {
  it('adds row classes from the closed-vocabulary status strings', async () => {
    const { service } = makeServiceHarness();

    await service.generate(CASE_ID);

    const inventory = renderData().inventory;
    expect(inventory.comparables[0].row_class).toBe('quarantined-row');
    expect(inventory.comparables[0].status_class).toBe('txt-amber');
    expect(inventory.grounds[0].verification_class).toBe('txt-green');
    expect(inventory.issues[0].verification_class).toBe('txt-amber');
    expect(inventory.documents[0].status_class).toBe('txt-green');
    // The model's own note passes through untouched.
    expect(inventory.comparables_note).toBe('Two are part-interest transfers.');
  });

  it('renders all four group deep dives in fixed order even when the model omits one', async () => {
    const { service } = makeServiceHarness(makeInputs(), {
      ...MODEL_OUTPUT,
      group_deep_dives: [{ label: 'Documents', points_narrative: 'documents prose' }],
    });

    await service.generate(CASE_ID);

    const dives = renderData().group_deep_dives;
    expect(dives.map((d: any) => d.label)).toEqual([
      'Comparables',
      'Reason For Objection',
      'Supporting Evidence',
      'Documents',
    ]);
    expect(dives[0].points_narrative).toBeUndefined(); // renders "-" in the template
    expect(dives[0].points_display).toBe('34'); // but the stored points still show
    expect(dives[3].points_narrative).toBe('documents prose');
  });

  it('never claims evidence is absent just because the model failed to tabulate it', async () => {
    // The table renders empty either because there is genuinely nothing, or because the model dropped
    // it. Only the first may be stated as fact — the second would be a false claim about the client's
    // own evidence, in a document they read.
    const { service } = makeServiceHarness(
      makeInputs({ comparables: [{ id: 'a' }, { id: 'b' }] as ComparableSale[] }),
      { ...MODEL_OUTPUT, inventory: {} },
    );

    await service.generate(CASE_ID);

    const fallback = renderData().inventory.comparables_fallback;
    expect(fallback).toContain('2 comparable sales are on file');
    expect(fallback).not.toContain('No comparable sales');
  });

  it('does say so plainly when there genuinely is nothing on file', async () => {
    const { service } = makeServiceHarness(makeInputs({ comparables: [] }), {
      ...MODEL_OUTPUT,
      inventory: {},
    });

    await service.generate(CASE_ID);

    expect(renderData().inventory.comparables_fallback).toBe(
      'No comparable sales are on file for this case.',
    );
  });

  it('derives the gap severity class from the closed set', async () => {
    const { service } = makeServiceHarness();

    await service.generate(CASE_ID);

    expect(renderData().gap_analysis[0].severity_class).toBe('txt-red');
  });
});
