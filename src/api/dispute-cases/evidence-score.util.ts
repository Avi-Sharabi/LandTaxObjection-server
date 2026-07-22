import { DisputeEvidenceIssue } from '../supporting-evidence/entities/dispute-evidence-issue.entity';
import { DisputeObjectionReason } from './entities/dispute-objection-reason.entity';
import { ComparableSale } from '../comparables/entities/comparable-sale.entity';

const VERIFIED_STATUSES = new Set(['EVIDENCE_OBTAINED', 'CLIENT_CONFIRMED']);

export interface EvidenceStrengthResult {
  score: number;
  rationale: string;
}

/**
 * Pure implementation of the rubric in src/skills/evidence-score.md, run directly against
 * the same rows already fetched for the valuation-report prompt. Previously this score was
 * computed by Claude inside the report-generation call; free-form LLM arithmetic on an
 * unconstrained sampling temperature made identical inputs produce different scores across
 * runs. This function has no model in the loop, so identical inputs always score identically.
 */
export function calculateEvidenceStrengthScore(
  evidenceIssues: DisputeEvidenceIssue[],
  comparables: ComparableSale[],
  objectionReasons: DisputeObjectionReason[],
): EvidenceStrengthResult {
  const tickedIssues = evidenceIssues.filter((issue) => issue.is_tick);
  const tickedGrounds = objectionReasons.filter((reason) => reason.is_tick);
  const comparableCount = comparables.length;

  if (tickedIssues.length === 0 && comparableCount === 0 && tickedGrounds.length === 0) {
    return {
      score: 0,
      rationale: 'No supporting evidence, comparable sales, or objection grounds were provided.',
    };
  }

  const evidence = scoreSupportingEvidence(tickedIssues);
  const componentB = scoreComparableSales(comparableCount);
  const grounds = scoreObjectionGrounds(tickedGrounds);

  const score = Math.max(0, Math.min(100, evidence.componentA + componentB + grounds.componentC));

  const rationale = buildRationale({
    tickedIssueCount: tickedIssues.length,
    high: evidence.high,
    medium: evidence.medium,
    verifiedIssues: evidence.verifiedIssues,
    comparableCount,
    groundCount: tickedGrounds.length,
    verifiedGrounds: grounds.verifiedGrounds,
  });

  return { score, rationale };
}

function isVerified(status: string | null): boolean {
  return status != null && VERIFIED_STATUSES.has(status);
}

function scoreSupportingEvidence(tickedIssues: DisputeEvidenceIssue[]) {
  const total = tickedIssues.length;
  if (total === 0) return { componentA: 0, high: 0, medium: 0, verifiedIssues: 0 };

  const high = tickedIssues.filter((issue) => issue.confidence === 'HIGH').length;
  const medium = tickedIssues.filter((issue) => issue.confidence === 'MEDIUM').length;
  const verifiedIssues = tickedIssues.filter((issue) => isVerified(issue.verification_status)).length;

  const confidenceRatio = (high + 0.5 * medium) / total;
  const verificationRatio = verifiedIssues / total;
  const componentA = Math.round(20 * confidenceRatio) + Math.round(20 * verificationRatio);

  return { componentA, high, medium, verifiedIssues };
}

function scoreComparableSales(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 10;
  if (count <= 4) return 20;
  return 30;
}

function scoreObjectionGrounds(tickedGrounds: DisputeObjectionReason[]) {
  const total = tickedGrounds.length;
  if (total === 0) return { componentC: 0, verifiedGrounds: 0 };

  const verifiedGrounds = tickedGrounds.filter((reason) => isVerified(reason.verification_status)).length;

  const breadth = Math.min(total, 3) / 3;
  const strength = verifiedGrounds / total;
  const componentC = Math.round(15 * breadth) + Math.round(15 * strength);

  return { componentC, verifiedGrounds };
}

function buildRationale(args: {
  tickedIssueCount: number;
  high: number;
  medium: number;
  verifiedIssues: number;
  comparableCount: number;
  groundCount: number;
  verifiedGrounds: number;
}): string {
  const parts: string[] = [];

  if (args.tickedIssueCount > 0) {
    parts.push(
      `Supporting evidence: ${args.high + args.medium}/${args.tickedIssueCount} HIGH or MEDIUM confidence ` +
        `(${args.high} HIGH, ${args.medium} MEDIUM)`,
    );
    parts.push(`${args.verifiedIssues}/${args.tickedIssueCount} verified`);
  } else {
    parts.push('no supporting evidence issues ticked');
  }

  parts.push(args.comparableCount === 1 ? '1 comparable sale' : `${args.comparableCount} comparable sales`);

  if (args.groundCount > 0) {
    parts.push(`${args.verifiedGrounds}/${args.groundCount} objection grounds verified`);
  } else {
    parts.push('no objection grounds ticked');
  }

  return `${parts.join('; ')}.`;
}
