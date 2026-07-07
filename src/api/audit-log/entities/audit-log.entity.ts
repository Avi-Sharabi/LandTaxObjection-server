import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum AuditAction {
  SUBMITTED_TO_VG = 'SUBMITTED_TO_VG',
  VG_FOLLOW_UP_SENT = 'VG_FOLLOW_UP_SENT',
  CASE_ADVANCED_TO_APPRAISAL = 'CASE_ADVANCED_TO_APPRAISAL',
  CASE_CLOSED_NO_OBJECTION = 'CASE_CLOSED_NO_OBJECTION',
  OBJECTION_PACKAGE_SENT = 'OBJECTION_PACKAGE_SENT',
  OBJECTION_PACKAGE_APPROVED = 'OBJECTION_PACKAGE_APPROVED',
  APPRAISAL_SUBMITTED = 'APPRAISAL_SUBMITTED',
  VG_OUTCOME_APPROVED = 'VG_OUTCOME_APPROVED',
  VG_OUTCOME_DECLINED = 'VG_OUTCOME_DECLINED',
  VG_OUTCOME_NEEDS_REVIEW = 'VG_OUTCOME_NEEDS_REVIEW',
  DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED',
}

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

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
