import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum AuditAction {
  SUBMITTED_TO_VG = 'SUBMITTED_TO_VG',
  VG_FOLLOW_UP_SENT = 'VG_FOLLOW_UP_SENT',
  FURTHER_SUBMISSION_SENT = 'FURTHER_SUBMISSION_SENT',
  VG_OUTCOME_RECORDED = 'VG_OUTCOME_RECORDED',
  TNC_AGREED = 'TNC_AGREED',
  REPORTS_UPLOADED = 'REPORTS_UPLOADED',
  ANALYSED = 'ANALYSED',
  VG_RESPONSE_RECORDED = 'VG_RESPONSE_RECORDED',
  CASE_CLOSED = 'CASE_CLOSED',
  /** An inbound VG email was classified, but no status was written — a human still decides. */
  VG_EMAIL_CLASSIFIED = 'VG_EMAIL_CLASSIFIED',
  /** Admin override: the transition table was bypassed and NO side effects ran. */
  STATUS_FORCED = 'STATUS_FORCED',
}

/** Recorded on audit rows written by a system trigger rather than a person. */
export const SYSTEM_ACTOR_ROLE = 'system';

/** performed_by is NOT NULL and carries no FK, so automated writers use this sentinel. */
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false })
  action: AuditAction;

  @Column({ name: 'performed_by', type: 'uuid', nullable: false })
  performedBy: string;

  @Column({ name: 'case_id', type: 'uuid', nullable: false })
  caseId: string;

  @Column({ name: 'lodgment_reference_number', type: 'text', nullable: true })
  lodgmentReferenceNumber: string | null;

  // Stored as text, not the status enum, so an audit row stays readable across future vocabulary
  // changes. Null on rows that are not a status transition, and on all historical rows.
  @Column({ name: 'from_status', type: 'text', nullable: true })
  fromStatus: string | null;

  @Column({ name: 'to_status', type: 'text', nullable: true })
  toStatus: string | null;

  /** The actor's role, or SYSTEM_ACTOR_ROLE for an automated trigger. */
  @Column({ name: 'performed_by_role', type: 'text', nullable: true })
  performedByRole: string | null;

  /**
   * Free-text note about this event. Required for a forced transition, and the home for what a
   * VG response said — dispute_cases.vg_response_notes used to hold the latter, but a single
   * per-case blob could not say which response a note belonged to once the case started cycling
   * between vg_response_received and ai_further_submission.
   */
  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
