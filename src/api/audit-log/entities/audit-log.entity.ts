import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum AuditAction {
  SUBMITTED_TO_VG = 'SUBMITTED_TO_VG',
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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
