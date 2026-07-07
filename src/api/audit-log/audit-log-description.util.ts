import { AuditAction } from './entities/audit-log.entity';

export interface DescriptionInput {
  performedByName: string | null;
  caseReference: string;
  lodgmentReferenceNumber: string | null;
  metadata: Record<string, unknown> | null;
}

const DESCRIPTION_TEMPLATES: Record<AuditAction, (input: DescriptionInput) => string> = {
  [AuditAction.SUBMITTED_TO_VG]: (i) =>
    `${i.performedByName ?? 'A staff member'} submitted case ${i.caseReference} to the Valuer-General (Ref: ${i.lodgmentReferenceNumber ?? 'N/A'}).`,
  [AuditAction.VG_FOLLOW_UP_SENT]: (i) => `A follow-up was sent to the Valuer-General for case ${i.caseReference}.`,
  [AuditAction.CASE_ADVANCED_TO_APPRAISAL]: (i) =>
    `${i.performedByName ?? 'A staff member'} advanced case ${i.caseReference} to appraisal.`,
  [AuditAction.CASE_CLOSED_NO_OBJECTION]: (i) =>
    `${i.performedByName ?? 'A staff member'} closed case ${i.caseReference} with no objection.`,
  [AuditAction.OBJECTION_PACKAGE_SENT]: (i) =>
    `${i.performedByName ?? 'A staff member'} sent the objection package for case ${i.caseReference} for client approval.`,
  [AuditAction.OBJECTION_PACKAGE_APPROVED]: (i) =>
    `The client approved the objection package for case ${i.caseReference}.`,
  [AuditAction.APPRAISAL_SUBMITTED]: (i) =>
    `${i.performedByName ?? 'A staff member'} submitted an appraisal for case ${i.caseReference} (${String(i.metadata?.['decisionOutcome'] ?? '')}).`,
  [AuditAction.VG_OUTCOME_APPROVED]: (i) => `The Valuer-General approved the objection for case ${i.caseReference}.`,
  [AuditAction.VG_OUTCOME_DECLINED]: (i) => `The Valuer-General declined the objection for case ${i.caseReference}.`,
  [AuditAction.VG_OUTCOME_NEEDS_REVIEW]: (i) =>
    `The VG response for case ${i.caseReference} was flagged for manual review.`,
  [AuditAction.DOCUMENT_UPLOADED]: (i) =>
    `${i.performedByName ?? 'A staff member'} uploaded "${String(i.metadata?.['documentName'] ?? 'a document')}" for case ${i.caseReference}.`,
};

const ACTIVITY_CATEGORY: Record<AuditAction, string> = {
  [AuditAction.SUBMITTED_TO_VG]: 'vg_outcome',
  [AuditAction.VG_FOLLOW_UP_SENT]: 'vg_outcome',
  [AuditAction.CASE_ADVANCED_TO_APPRAISAL]: 'status_change',
  [AuditAction.CASE_CLOSED_NO_OBJECTION]: 'status_change',
  [AuditAction.OBJECTION_PACKAGE_SENT]: 'status_change',
  [AuditAction.OBJECTION_PACKAGE_APPROVED]: 'client_action',
  [AuditAction.APPRAISAL_SUBMITTED]: 'status_change',
  [AuditAction.VG_OUTCOME_APPROVED]: 'vg_outcome',
  [AuditAction.VG_OUTCOME_DECLINED]: 'vg_outcome',
  [AuditAction.VG_OUTCOME_NEEDS_REVIEW]: 'vg_outcome',
  [AuditAction.DOCUMENT_UPLOADED]: 'document',
};

const ACTIVITY_COLOR_HINT: Record<AuditAction, string> = {
  [AuditAction.SUBMITTED_TO_VG]: 'warning',
  [AuditAction.VG_FOLLOW_UP_SENT]: 'warning',
  [AuditAction.CASE_ADVANCED_TO_APPRAISAL]: 'info',
  [AuditAction.CASE_CLOSED_NO_OBJECTION]: 'neutral',
  [AuditAction.OBJECTION_PACKAGE_SENT]: 'info',
  [AuditAction.OBJECTION_PACKAGE_APPROVED]: 'success',
  [AuditAction.APPRAISAL_SUBMITTED]: 'warning',
  [AuditAction.VG_OUTCOME_APPROVED]: 'success',
  [AuditAction.VG_OUTCOME_DECLINED]: 'error',
  [AuditAction.VG_OUTCOME_NEEDS_REVIEW]: 'neutral',
  [AuditAction.DOCUMENT_UPLOADED]: 'info',
};

export function buildActivityDescription(action: AuditAction, input: DescriptionInput): string {
  return DESCRIPTION_TEMPLATES[action](input);
}

export function getActivityCategory(action: AuditAction): string {
  return ACTIVITY_CATEGORY[action];
}

export function getActivityColorHint(action: AuditAction): string {
  return ACTIVITY_COLOR_HINT[action];
}
