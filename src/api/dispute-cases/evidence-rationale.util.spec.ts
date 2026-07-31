import {
  RECOMMENDATIONS_MARKER,
  RECOMMENDATIONS_NONE,
  hasScorableEvidence,
  isRationaleLabel,
  parseEvidenceRationale,
  resolveScoreBand,
  SCORE_BANDS,
} from './evidence-rationale.util';

const CANONICAL = [
  '(34) Comparables - Six vacant-land sales within 1.2 km, all rates on a stated land-only basis.',
  '(20) Reason For Objection - Ground 1 pleaded with a specific overstatement and a named valuation date.',
  '(18) Supporting Evidence - Flood constraint corroborated by the s10.7 certificate on file.',
  '(10) Documents - Land Value Search and assessment notice held; no CPV report obtained.',
  RECOMMENDATIONS_MARKER,
  '[+6] Supporting Evidence - Obtain the survey confirming the recorded area.',
  '[+4] Comparables - Add two post-valuation-date sales in the same zone.',
].join('\n');

describe('parseEvidenceRationale', () => {
  it('parses the canonical two-section form', () => {
    const parsed = parseEvidenceRationale(CANONICAL);

    expect(parsed.rows.map((r) => r.label)).toEqual([
      'Comparables',
      'Reason For Objection',
      'Supporting Evidence',
      'Documents',
    ]);
    expect(parsed.rows.map((r) => r.points)).toEqual([34, 20, 18, 10]);
    expect(parsed.total).toBe(82);
    expect(parsed.prose).toBeNull();
    expect(parsed.recommendations).toEqual([
      { group: 'Supporting Evidence', action: 'Obtain the survey confirming the recorded area.', lift: 6 },
      { group: 'Comparables', action: 'Add two post-valuation-date sales in the same zone.', lift: 4 },
    ]);
  });

  it('distinguishes "a run found nothing" ([]) from "no run has ever produced any" (null)', () => {
    const withMarker = `(50) Comparables - x\n(50) Documents - y\n${RECOMMENDATIONS_NONE}`;
    expect(parseEvidenceRationale(withMarker).recommendations).toEqual([]);

    const withoutMarker = '(50) Comparables - x\n(50) Documents - y';
    expect(parseEvidenceRationale(withoutMarker).recommendations).toBeNull();
  });

  it('counts recommendation lines as computed even without the marker line', () => {
    const parsed = parseEvidenceRationale('(80) Comparables - x\n[+5] Documents - Obtain the deed.');
    expect(parsed.recommendations).toHaveLength(1);
  });

  it('falls back to prose for a legacy single-sentence rationale', () => {
    const legacy = 'Strong comparable evidence but the constraint is unverified.';
    const parsed = parseEvidenceRationale(legacy);

    expect(parsed.rows).toEqual([]);
    expect(parsed.prose).toBe(legacy);
    expect(parsed.total).toBeNull();
  });

  it('never leaks the raw storage format into the prose slot', () => {
    // Recommendations parsed but no breakdown: prose must stay null rather than carrying the
    // "[+6] ..." lines, which a reader would see verbatim in a client-facing PDF.
    const parsed = parseEvidenceRationale(`${RECOMMENDATIONS_MARKER}\n[+6] Documents - Obtain the deed.`);
    expect(parsed.prose).toBeNull();
    expect(parsed.recommendations).toHaveLength(1);
  });

  it('accepts en and em dashes as separators in both sections', () => {
    const parsed = parseEvidenceRationale(
      `(40) Comparables – four sales on file\n${RECOMMENDATIONS_MARKER}\n[+3] Documents — Obtain the plan.`,
    );
    expect(parsed.rows[0]).toEqual({
      label: 'Comparables',
      points: 40,
      explanation: 'four sales on file',
    });
    expect(parsed.recommendations?.[0].action).toBe('Obtain the plan.');
  });

  it('keeps a hyphen inside an explanation intact', () => {
    const parsed = parseEvidenceRationale('(34) Comparables - Rates span $1,040-$1,110/m² land-only.');
    expect(parsed.rows[0].explanation).toBe('Rates span $1,040-$1,110/m² land-only.');
  });

  it('keeps a partial parse rather than dropping the whole breakdown', () => {
    const parsed = parseEvidenceRationale('(34) Comparables - x\nnot a line at all\n(10) Documents - y');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.total).toBe(44);
  });

  it('treats an N/A points value as off-format, leaving fewer than four rows', () => {
    // Deliberately narrower than the frontend regex — see the comment on RATIONALE_LINE.
    const parsed = parseEvidenceRationale('(N/A) Comparables - not applicable\n(80) Documents - y');
    expect(parsed.rows.map((r) => r.label)).toEqual(['Documents']);
  });

  it.each([null, undefined, '', '   '])('returns the empty shape for %p', (input) => {
    expect(parseEvidenceRationale(input as string | null)).toEqual({
      rows: [],
      prose: null,
      total: null,
      recommendations: null,
    });
  });
});

describe('resolveScoreBand', () => {
  it.each([
    [0, 'Minimal'],
    [29, 'Minimal'],
    [30, 'Weak'],
    [44, 'Weak'],
    [45, 'Moderate'],
    [59, 'Moderate'],
    [60, 'Reasonably Supported'],
    [69, 'Reasonably Supported'],
    [70, 'Good / Solid'],
    [79, 'Good / Solid'],
    [80, 'Strong'],
    [89, 'Strong'],
    [90, 'Exceptional'],
    [100, 'Exceptional'],
  ])('resolves %i to %s', (score, label) => {
    expect(resolveScoreBand(score)?.label).toBe(label);
  });

  it('clamps a stored value outside 0-100 to the nearest real band', () => {
    expect(resolveScoreBand(-5)?.label).toBe('Minimal');
    expect(resolveScoreBand(105)?.label).toBe('Exceptional');
  });

  it.each([null, undefined, NaN, Infinity])('returns null for %p', (score) => {
    expect(resolveScoreBand(score as number | null)).toBeNull();
  });

  it('covers 0-100 with no gap or overlap', () => {
    for (let score = 0; score <= 100; score += 1) {
      const matches = SCORE_BANDS.filter((b) => score >= b.min && score <= b.max);
      expect(matches).toHaveLength(1);
    }
  });
});

describe('hasScorableEvidence', () => {
  it('opens on any one of the three clauses', () => {
    expect(hasScorableEvidence({ comparables: 1, tickedIssues: 0, tickedGrounds: 0 })).toBe(true);
    expect(hasScorableEvidence({ comparables: 0, tickedIssues: 1, tickedGrounds: 0 })).toBe(true);
    expect(hasScorableEvidence({ comparables: 0, tickedIssues: 0, tickedGrounds: 1 })).toBe(true);
  });

  it('stays closed when nothing is on file', () => {
    expect(hasScorableEvidence({ comparables: 0, tickedIssues: 0, tickedGrounds: 0 })).toBe(false);
  });
});

describe('isRationaleLabel', () => {
  it('matches exactly, not loosely', () => {
    expect(isRationaleLabel('Reason For Objection')).toBe(true);
    expect(isRationaleLabel('reason for objection')).toBe(false);
    expect(isRationaleLabel('Comparables ')).toBe(false);
    expect(isRationaleLabel('Anything Else')).toBe(false);
  });
});
