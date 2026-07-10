import { IssueResult, GroupingIssueResult } from '../supporting-evidence.types';

const CONFIDENCE_VALUES = new Set(['HIGH', 'MEDIUM', 'LOW', 'MANUAL_REVIEW_REQUIRED']);

function toConfidence(raw: unknown): IssueResult['confidence'] {
  return CONFIDENCE_VALUES.has(raw as string)
    ? (raw as IssueResult['confidence'])
    : 'MANUAL_REVIEW_REQUIRED';
}

export function toIssueResult(raw: Record<string, unknown>): IssueResult {
  return {
    tick: typeof raw['tick'] === 'boolean' ? raw['tick'] : false,
    confidence: toConfidence(raw['confidence']),
    // Always AI_DETECTED_UNVERIFIED here — this mapper only ever sees Claude Vision's own
    // desktop-data inference, never a corroborating document. See supporting-evidence.types.ts.
    verification_status: 'AI_DETECTED_UNVERIFIED',
    trigger: typeof raw['trigger'] === 'string' ? raw['trigger'] : null,
    text_box_content: typeof raw['text_box_content'] === 'string' ? raw['text_box_content'] : null,
    documents_to_attach: Array.isArray(raw['documents_to_attach'])
      ? (raw['documents_to_attach'] as string[])
      : [],
    ...raw,
  };
}

export function toGroupingIssueResult(raw: Record<string, unknown>): GroupingIssueResult {
  // The skill puts text_box_content and documents_to_attach at the top level, not nested
  const topTextBox = typeof raw['text_box_content'] === 'string' ? raw['text_box_content'] : null;
  const topDocs = Array.isArray(raw['documents_to_attach'])
    ? (raw['documents_to_attach'] as string[])
    : [];

  const mapSub = (sub: unknown): GroupingIssueResult['valued_together'] => {
    const s = (sub ?? {}) as Record<string, unknown>;
    return {
      tick: typeof s['tick'] === 'boolean' ? s['tick'] : false,
      confidence: toConfidence(s['confidence']),
      verification_status: 'AI_DETECTED_UNVERIFIED',
      trigger: typeof s['trigger'] === 'string' ? s['trigger'] : null,
      text_box_content:
        (typeof s['text_box_content'] === 'string' ? s['text_box_content'] : null) ?? topTextBox,
      documents_to_attach:
        (Array.isArray(s['documents_to_attach']) ? (s['documents_to_attach'] as string[]) : null) ??
        topDocs,
    };
  };

  return {
    valued_together: mapSub(raw['valued_together']),
    valued_separately: mapSub(raw['valued_separately']),
    ...raw,
  };
}
