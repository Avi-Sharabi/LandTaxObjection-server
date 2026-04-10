import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DisputeCase } from './dispute-case.entity';

export enum AuditAction {
  VG_RESPONSE_RECORDED = 'VG_RESPONSE_RECORDED',
  VG_EMAIL_RESPONSE_DETECTED = 'VG_EMAIL_RESPONSE_DETECTED',
}

@Entity('case_audit_logs')
export class CaseAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'case_id' })
  case_id: string;

  @Column({ type: 'text' })
  action: string;

  @Column({ type: 'uuid', name: 'performed_by', nullable: true })
  performed_by: string | null;

  @Column({ type: 'text', nullable: true })
  source: string | null;

  @Column({ type: 'text', nullable: true })
  response_notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => DisputeCase, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'case_id' })
  dispute_case: DisputeCase;
}
