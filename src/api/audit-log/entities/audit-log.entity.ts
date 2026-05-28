import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum AuditAction {
  // VG workflow (existing)
  SUBMITTED_TO_VG = 'SUBMITTED_TO_VG',
  VG_FOLLOW_UP_SENT = 'VG_FOLLOW_UP_SENT',

  // Case lifecycle
  CASE_CREATED = 'CASE_CREATED',
  CASE_UPDATED = 'CASE_UPDATED',
  CASE_DELETED = 'CASE_DELETED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  CASE_ASSIGNED = 'CASE_ASSIGNED',
  CASE_APPROVED = 'CASE_APPROVED',
  CASE_REJECTED = 'CASE_REJECTED',

  // Documents
  DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED',
  DOCUMENT_DELETED = 'DOCUMENT_DELETED',

  // Comparables
  COMPARABLE_ADDED = 'COMPARABLE_ADDED',
  COMPARABLE_REMOVED = 'COMPARABLE_REMOVED',

  // Legal grounds & constraints
  LEGAL_GROUNDS_UPDATED = 'LEGAL_GROUNDS_UPDATED',
  CONSTRAINT_ADDED = 'CONSTRAINT_ADDED',
  CONSTRAINT_REMOVED = 'CONSTRAINT_REMOVED',

  // Appraisal & valuation
  APPRAISAL_SUBMITTED = 'APPRAISAL_SUBMITTED',
  VALUATION_NOTICE_ADDED = 'VALUATION_NOTICE_ADDED',

  // Objection package
  OBJECTION_PACKAGE_CREATED = 'OBJECTION_PACKAGE_CREATED',
  OBJECTION_PACKAGE_SUBMITTED = 'OBJECTION_PACKAGE_SUBMITTED',

  // User session
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
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

  @Column({ name: 'entity_type', type: 'text', nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'performed_by_name', type: 'text', nullable: true })
  performedByName: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
