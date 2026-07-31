import { promises as fs } from 'fs';
import { join } from 'path';
import * as nunjucks from 'nunjucks';
import { findLeftoverArtifact } from './report-pdf.util';

// The service spec mocks nunjucks so it can assert on the render data, which means nothing there ever
// touches the real template. This suite is the other half: it renders the actual .j2 with a realistic
// payload, so a Jinja syntax error or a field renamed on one side only fails here rather than in a
// background worker in production.
//
// Deliberately NOT mocking nunjucks, and deliberately reading the template off disk by the same path
// shape the service uses — which doubles as a check that the file is where loadSkillFiles() looks.
const TEMPLATE_PATH = join(__dirname, '..', '..', 'skills', 'evidence-score-report', 'report_template.html.j2');

let template: string;

beforeAll(async () => {
  template = await fs.readFile(TEMPLATE_PATH, 'utf-8');
});

function scoredRenderData() {
  return {
    meta: {
      confidentiality: 'Confidential — prepared for the named client.',
      headline_address: '1 Test St, Testville NSW 2000',
      report_date: '31 July 2026',
      case_reference: 'CASE-0001',
    },
    key_finding: 'Four locality sales on a stated land-only basis support the contended rate.',
    cover_facts: [
      { label: 'Property', value: '1 Test St, Testville NSW 2000' },
      { label: 'Evidence Strength Score', value: '82 / 100' },
    ],
    score: {
      display: '82 / 100',
      band_label: 'Strong',
      band_range_display: '80-89',
      band_description: 'Clearly persuasive; an assessor would have to engage with it seriously.',
      not_scorable: false,
      not_scorable_lead: '',
    },
    prerequisites: [],
    dashboard: {
      intro: 'This case pleads a value-too-high objection.',
      commentary: 'Comparables carry the case.',
      rows: [
        {
          label: 'Comparables',
          points_display: '34',
          points_class: 'num',
          share_display: '41.5%',
          share_pct: 42,
          explanation: 'Six vacant-land sales within 1.2 km.',
        },
        {
          label: 'Documents',
          points_display: '0',
          points_class: 'txt-amber',
          share_display: '0.0%',
          share_pct: 0,
          explanation: 'Not needed for the ground pleaded.',
        },
      ],
      total_display: '82',
      prose: null,
      sum_mismatch: false,
      sum_mismatch_note: 'indicative only',
    },
    band_narrative: {
      what_it_means: ['A case at this band reads as persuasive.'],
      out_of_scope: ['This is not a probability that the Valuer General will agree.'],
    },
    inventory: {
      comparables_note: 'Two are part-interest transfers.',
      comparables: [
        {
          ref: 'C1',
          address: '2 Test St, Testville',
          area_display: '512',
          zone: 'R2',
          sale_price_display: '$1,200,000',
          adjusted_value_display: '$980,000',
          rate_display: '$1,914',
          date: '4 March 2026',
          status: 'INCLUDED',
          status_class: '',
          row_class: '',
        },
        {
          ref: 'C2',
          address: '9 Other St, Testville',
          area_display: '480',
          zone: 'R2',
          sale_price_display: '$600,000',
          adjusted_value_display: '$480,000',
          rate_display: '$1,000',
          date: '1 February 2026',
          status: 'EXCLUDED — part-interest sale',
          status_class: 'txt-amber',
          row_class: 'quarantined-row',
        },
      ],
      comparables_fallback: 'No comparable sales are on file for this case.',
      grounds_note: 'Both selected grounds carry findings.',
      grounds: [
        {
          ground_number: '1',
          label: 'Value too high',
          selected: 'Selected',
          verification_display: 'CONFIRMED',
          verification_class: 'txt-green',
          note: '-',
        },
      ],
      grounds_fallback: 'No objection grounds are assessed for this case.',
      issues_note: 'One of three is documented.',
      issues: [
        {
          issue_type: 'Flooding',
          confidence_display: 'HIGH',
          verification_display: 'AI-DETECTED — NOT YET VERIFIED',
          verification_class: 'txt-amber',
          documents_to_obtain: 's10.7 planning certificate',
        },
      ],
      issues_fallback: 'No supporting-evidence issues are selected for this case.',
      documents_note: 'A CPV report would most change the picture.',
      documents: [
        {
          name: 'Land Value Search',
          status: 'READ',
          status_class: 'txt-green',
          reason: 'Land value search',
        },
      ],
      documents_fallback: 'No source documents are on file for this case.',
    },
    group_deep_dives: [
      {
        label: 'Comparables',
        heading: 'COMPARABLE SALES — DETAILED ASSESSMENT',
        points_display: '34',
        share_display: '41.5%',
        points_narrative: 'Six sales, four usable.',
        strengths: ['Four sales within 1.2 km'],
        weaknesses: [],
        what_would_change_it: 'An independent valuation.',
      },
      {
        label: 'Reason For Objection',
        heading: 'REASON FOR OBJECTION — DETAILED ASSESSMENT',
        points_display: '20',
        share_display: '24.4%',
        points_narrative: 'Ground 1 pleaded specifically.',
        strengths: [],
        weaknesses: ['No stated overstatement percentage'],
        what_would_change_it: 'A quantified contention.',
      },
      {
        label: 'Supporting Evidence',
        heading: 'SUPPORTING EVIDENCE — DETAILED ASSESSMENT',
        points_display: '18',
        share_display: '22.0%',
        points_narrative: 'One constraint corroborated.',
        strengths: [],
        weaknesses: [],
        what_would_change_it: 'The s10.7 certificate.',
      },
      {
        label: 'Documents',
        heading: 'SOURCE DOCUMENTS — DETAILED ASSESSMENT',
        points_display: '10',
        share_display: '12.2%',
        points_narrative: 'Notice and search held.',
        strengths: [],
        weaknesses: [],
        what_would_change_it: 'A CPV report.',
      },
    ],
    gap_analysis: [
      {
        group: 'Documents',
        missing: 'No independent CPV valuation',
        why_it_matters: 'The contended rate rests entirely on automated sales analysis.',
        severity: 'MATERIAL',
        severity_class: 'txt-red',
      },
    ],
    roadmap: [
      {
        priority: 1,
        group: 'Supporting Evidence',
        action: 'Obtain the survey confirming the recorded area.',
        lift_display: '+6',
        how: 'Engage a registered surveyor.',
        establishes: 'The true site area against the VG record.',
      },
    ],
    roadmap_empty_note: 'nothing outstanding',
    roadmap_disclaimer: 'Estimated lift is an indication, not a guarantee.',
    projected: {
      narrative: 'Completing the roadmap would consolidate the case.',
      rows: [
        { label: 'Current evidence score', value: '82 / 100' },
        { label: 'Projected evidence score', value: '88 / 100' },
      ],
    },
    disclaimer_paragraphs: ['This report is not legal, valuation or tax advice.'],
  };
}

function notScorableRenderData() {
  const data = scoredRenderData();
  return {
    ...data,
    key_finding: 'Nothing is yet on file for this case.',
    // buildRenderData() builds cover_facts from the same facts as `score`, so an unscored case never
    // carries a scored cover row. Overridden here so the fixture stays internally consistent.
    cover_facts: [
      { label: 'Property', value: '1 Test St, Testville NSW 2000' },
      { label: 'Evidence Strength Score', value: 'Not yet scored' },
    ],
    score: {
      display: 'Not yet scored',
      band_label: 'Not yet scored',
      band_range_display: '',
      band_description: '-',
      not_scorable: true,
      not_scorable_lead: 'No evidence strength score has been recorded. This is not a score of zero.',
    },
    prerequisites: [
      {
        clause: 'At least one comparable sale on file',
        current: '0 on file',
        status: 'NOT MET',
        statusClass: 'st-urgent',
      },
    ],
    dashboard: { ...data.dashboard, rows: [], prose: null },
    inventory: { ...data.inventory, comparables: [], grounds: [], issues: [], documents: [] },
    roadmap: [],
    projected: { narrative: 'Gathering the prerequisites would make an assessment possible.', rows: [] },
  };
}

describe('evidence score report template', () => {
  it('renders the scored variant without leaving an artifact the guard would reject', () => {
    const html = nunjucks.renderString(template, scoredRenderData());

    expect(findLeftoverArtifact(html)).toBeNull();
    expect(html).toContain('82 / 100');
    expect(html).toContain('Strong');
    expect(html).toContain('EXCLUDED — part-interest sale');
    expect(html).toContain('Obtain the survey confirming the recorded area.');
    expect(html).toContain('This report is not legal, valuation or tax advice.');
  });

  it('numbers the four group deep dives 4 through 7', () => {
    const html = nunjucks.renderString(template, scoredRenderData());

    expect(html).toContain('4. COMPARABLE SALES — DETAILED ASSESSMENT');
    expect(html).toContain('5. REASON FOR OBJECTION — DETAILED ASSESSMENT');
    expect(html).toContain('6. SUPPORTING EVIDENCE — DETAILED ASSESSMENT');
    expect(html).toContain('7. SOURCE DOCUMENTS — DETAILED ASSESSMENT');
  });

  it('applies the server-computed classes rather than choosing them in the template', () => {
    const html = nunjucks.renderString(template, scoredRenderData());

    expect(html).toContain('class="quarantined-row"');
    expect(html).toContain('class="txt-green"'); // CONFIRMED verification
    expect(html).toContain('class="txt-red"'); // MATERIAL severity
    expect(html).toContain('width:42%'); // the share bar
  });

  it('renders the not-yet-scorable variant with prerequisites and no score', () => {
    const html = nunjucks.renderString(template, notScorableRenderData());

    expect(findLeftoverArtifact(html)).toBeNull();
    expect(html).toContain('EVIDENCE ASSESSMENT — NOT YET SCORABLE');
    expect(html).toContain('This is not a score of zero.');
    expect(html).toContain('NOT MET');
    expect(html).toContain('WHAT TO GATHER FIRST');
    expect(html).not.toContain('82 / 100');
  });

  it('falls back to the server-computed sentence when a table is empty', () => {
    const html = nunjucks.renderString(template, notScorableRenderData());

    expect(html).toContain('No comparable sales are on file for this case.');
    expect(html).toContain('No objection grounds are assessed for this case.');
  });

  it('renders prose instead of the breakdown table for a legacy rationale', () => {
    const data = scoredRenderData();
    const html = nunjucks.renderString(template, {
      ...data,
      dashboard: { ...data.dashboard, rows: [], prose: 'Strong comparables, unverified constraint.' },
    });

    expect(findLeftoverArtifact(html)).toBeNull();
    expect(html).toContain('Strong comparables, unverified constraint.');
  });

  it('survives a payload where every optional prose field is missing', () => {
    // The model can omit anything. None of it may produce a broken page or an unresolved token.
    const data = scoredRenderData();
    const html = nunjucks.renderString(template, {
      ...data,
      key_finding: undefined,
      dashboard: { ...data.dashboard, intro: undefined, commentary: undefined },
      band_narrative: { what_it_means: [], out_of_scope: [] },
      gap_analysis: [],
      roadmap: [],
      projected: { narrative: undefined, rows: [] },
      disclaimer_paragraphs: [],
      group_deep_dives: data.group_deep_dives.map((g) => ({
        ...g,
        points_narrative: undefined,
        strengths: [],
        weaknesses: [],
        what_would_change_it: undefined,
      })),
    });

    expect(findLeftoverArtifact(html)).toBeNull();
    expect(html).toContain('None identified.');
  });
});
