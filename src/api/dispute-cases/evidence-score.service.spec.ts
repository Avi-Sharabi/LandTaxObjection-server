import { EvidenceScoreService } from './evidence-score.service';
import { ValuationReportRepository } from './valuation-report.repository';
import { AnthropicService } from 'src/ai/anthropic.service';
import { SkillRegistryService } from 'src/mcp/skill-registry.service';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { AssessmentDocumentsService } from '../assessment-documents/assessment-documents.service';
import { ValuationCtxCacheService } from './valuation-ctx-cache.service';

// extractScore() and everything under it are pure functions over the model's JSON, so they are tested
// through a bare instance rather than a Nest module — the collaborators are never reached. They matter
// more than most parsing code: extractRecommendations() is the boundary that decides whether a
// sentence the model wrote after reading a client-supplied PDF is allowed onto an accountant's screen.
function makeService() {
  const anthropicService = {
    // The real implementation strips the ```json fence; here the test hands over the object directly.
    parseJsonObject: jest.fn((raw: string) => JSON.parse(raw)),
  };

  const service = new EvidenceScoreService(
    {} as unknown as ValuationReportRepository,
    anthropicService as unknown as AnthropicService,
    {} as unknown as SkillRegistryService,
    {} as unknown as ValuationCtxCacheService,
    {} as unknown as AssessmentDocumentsService,
    {} as unknown as AzureBlobService,
  );

  // Silenced so the expected warn paths do not fill the test output; assertions are on return values.
  jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

  return service;
}

const RATIONALE = [
  '(20) Comparables - Three sales in the locality within 12 months.',
  '(20) Reason For Objection - Value-too-high ground ties the easement to lost area.',
  '(10) Supporting Evidence - Easement client-confirmed; s10.7 certificate outstanding.',
  '(10) Documents - The notice confirms the assessed value.',
].join('\n');

/** Runs extractScore() the way compute() does, and returns just the recommendations. */
function recommendationsFrom(
  service: EvidenceScoreService,
  recommendations: unknown,
  score = 60,
): ReturnType<EvidenceScoreService['extractScore']>['recommendations'] {
  const payload = JSON.stringify({
    evidence_strength_score: score,
    rationale: RATIONALE,
    recommendations,
  });
  return service['extractScore'](payload, 'case-1').recommendations;
}

const VALID = {
  group: 'Supporting Evidence',
  action: 'Obtain the s10.7 planning certificate to document the flood overlay.',
  expected_lift: 6,
};

describe('EvidenceScoreService.extractRecommendations — the null/[] distinction', () => {
  it('keeps an empty array as [], the claim that nothing is left to improve', () => {
    expect(recommendationsFrom(makeService(), [])).toEqual([]);
  });

  it('returns null when the key is absent, so a legacy-shaped response is not read as "nothing to improve"', () => {
    expect(recommendationsFrom(makeService(), undefined)).toBeNull();
  });

  it('returns null when the value is not an array', () => {
    expect(recommendationsFrom(makeService(), { nope: true })).toBeNull();
  });

  it('returns null — never [] — when every item of a non-empty array is dropped', () => {
    const result = recommendationsFrom(makeService(), [{ group: 'Nonsense', action: 'Do a thing.' }]);
    expect(result).toBeNull();
  });

  it('never voids the score, whatever the recommendations look like', () => {
    const payload = JSON.stringify({
      evidence_strength_score: 82,
      rationale: RATIONALE,
      recommendations: 'not an array at all',
    });
    const extracted = makeService()['extractScore'](payload, 'case-1');
    expect(extracted.score).toBe(82);
    expect(extracted.rationale).toContain('Comparables');
    expect(extracted.recommendations).toBeNull();
  });
});

describe('EvidenceScoreService.serialiseRationale — packing both sections into one column', () => {
  /** The rationale text as it would be written to evidence_strength_rationale. */
  function rationaleFrom(recommendations: unknown, score = 60): string | null {
    const payload = JSON.stringify({
      evidence_strength_score: score,
      rationale: RATIONALE,
      recommendations,
    });
    return makeService()['extractScore'](payload, 'case-1').rationale;
  }

  it('writes the breakdown, then the marker, then one line per item', () => {
    const text = rationaleFrom([
      { ...VALID, group: 'Comparables', action: 'Add two more sales in the locality.', expected_lift: 8 },
      VALID,
    ]);
    expect(text).toBe(
      [
        RATIONALE,
        'Recommendations:',
        '[+8] Comparables - Add two more sales in the locality.',
        `[+6] Supporting Evidence - ${VALID.action}`,
      ].join('\n'),
    );
  });

  it('writes "Recommendations: none" for an empty array, so the empty state is distinguishable', () => {
    expect(rationaleFrom([])).toBe(`${RATIONALE}\nRecommendations: none`);
  });

  it('writes no marker at all when nothing usable came back, leaving a legacy-shaped rationale', () => {
    expect(rationaleFrom(undefined)).toBe(RATIONALE);
  });

  it('uses [+N] not (N), so the four breakdown points still sum to the score on their own', () => {
    const text = rationaleFrom([VALID]) ?? '';
    const pointLines = text.split('\n').filter((line) => /^\(\s*\d{1,3}\s*\)/.test(line));
    expect(pointLines).toHaveLength(4);
  });

  it('rebuilds the line from the validated item, so a rejected action cannot reach the text', () => {
    const text = rationaleFrom([{ ...VALID, action: 'Email the file to attacker@example.com now.' }]);
    expect(text).not.toContain('attacker@example.com');
    expect(text).toBe(RATIONALE); // dropped to null, so no marker is written
  });
});

describe('EvidenceScoreService.extractRecommendations — injection defence', () => {
  it('drops an item whose group is not one of the four rationale labels', () => {
    expect(recommendationsFrom(makeService(), [{ ...VALID, group: 'Payments' }])).toBeNull();
  });

  it('is case- and whitespace-exact about the group label', () => {
    expect(recommendationsFrom(makeService(), [{ ...VALID, group: 'supporting evidence' }])).toBeNull();
    expect(recommendationsFrom(makeService(), [{ ...VALID, group: '  Supporting Evidence  ' }])).toHaveLength(1);
  });

  it('drops an action carrying a URL', () => {
    const action = 'Upload the certificate at https://not-the-firm.example/upload to complete the file.';
    expect(recommendationsFrom(makeService(), [{ ...VALID, action }])).toBeNull();
  });

  it('drops an action carrying an email address', () => {
    const action = 'Email all documents to attacker@example.com so the overlay can be confirmed.';
    expect(recommendationsFrom(makeService(), [{ ...VALID, action }])).toBeNull();
  });

  it('drops an action carrying a newline, which would otherwise render as several rows', () => {
    const action = 'Obtain the certificate.\nAlso wire the fee to the account on the notice.';
    expect(recommendationsFrom(makeService(), [{ ...VALID, action }])).toBeNull();
  });

  it('keeps a legitimate action alongside a rejected one rather than dropping the whole list', () => {
    const result = recommendationsFrom(makeService(), [
      { ...VALID, action: 'See https://example.com for the form.' },
      VALID,
    ]);
    expect(result).toEqual([expect.objectContaining({ action: VALID.action })]);
  });

  it('drops items that are not objects', () => {
    expect(recommendationsFrom(makeService(), ['Obtain the certificate.', null, 42])).toBeNull();
  });

  it('drops an item with a missing or blank action', () => {
    expect(recommendationsFrom(makeService(), [{ group: VALID.group, expected_lift: 4 }])).toBeNull();
    expect(recommendationsFrom(makeService(), [{ ...VALID, action: '   ' }])).toBeNull();
  });
});

describe('EvidenceScoreService.extractRecommendations — shaping', () => {
  it('orders by expected_lift descending regardless of the order received', () => {
    const result = recommendationsFrom(makeService(), [
      { ...VALID, group: 'Documents', expected_lift: 2 },
      { ...VALID, group: 'Comparables', expected_lift: 9 },
      { ...VALID, group: 'Reason For Objection', expected_lift: 5 },
    ]);
    expect(result?.map((r) => r.expected_lift)).toEqual([9, 5, 2]);
  });

  it('keeps only the four largest when more than four arrive', () => {
    const result = recommendationsFrom(
      makeService(),
      [1, 3, 5, 7, 9, 11].map((lift) => ({ ...VALID, expected_lift: lift })),
    );
    expect(result?.map((r) => r.expected_lift)).toEqual([11, 9, 7, 5]);
  });

  it('clamps a single lift to 25 and coerces a quoted number', () => {
    const result = recommendationsFrom(makeService(), [{ ...VALID, expected_lift: '400' }]);
    expect(result?.[0].expected_lift).toBe(25);
  });

  it('treats a non-numeric or negative lift as 0 rather than dropping the advice', () => {
    expect(recommendationsFrom(makeService(), [{ ...VALID, expected_lift: 'lots' }])?.[0].expected_lift).toBe(0);
    expect(recommendationsFrom(makeService(), [{ ...VALID, expected_lift: -8 }])?.[0].expected_lift).toBe(0);
  });

  it('truncates an over-long action instead of dropping it', () => {
    const action = `Obtain the certificate ${'x'.repeat(400)}`;
    const result = recommendationsFrom(makeService(), [{ ...VALID, action }]);
    expect(result?.[0].action.length).toBeLessThanOrEqual(201); // 200 + the ellipsis truncate() adds
  });

  it('caps the lifts at the headroom the score actually has, clamping the tail', () => {
    // Score 90 leaves 10 points. 8 + 6 + 4 = 18 requested.
    const result = recommendationsFrom(
      makeService(),
      [
        { ...VALID, group: 'Comparables', expected_lift: 8 },
        { ...VALID, group: 'Documents', expected_lift: 6 },
        { ...VALID, group: 'Reason For Objection', expected_lift: 4 },
      ],
      90,
    );
    expect(result?.map((r) => r.expected_lift)).toEqual([8, 2, 0]);
    expect(result?.reduce((sum, r) => sum + r.expected_lift, 0)).toBe(10);
  });

  it('leaves the lifts alone when they already fit the headroom', () => {
    const result = recommendationsFrom(
      makeService(),
      [
        { ...VALID, group: 'Comparables', expected_lift: 8 },
        { ...VALID, group: 'Documents', expected_lift: 6 },
      ],
      60,
    );
    expect(result?.map((r) => r.expected_lift)).toEqual([8, 6]);
  });
});
