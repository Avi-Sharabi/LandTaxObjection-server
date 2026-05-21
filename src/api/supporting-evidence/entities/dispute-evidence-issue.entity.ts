import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';

@Entity('dispute_evidence_issues')
export class DisputeEvidenceIssue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'dispute_case_id' })
  dispute_case_id: string;

  @Column({ type: 'text', nullable: false })
  issue_type: string;

  @Column({ type: 'boolean', nullable: false, default: false })
  is_tick: boolean;

  @Column({ type: 'text', nullable: true })
  confidence: string | null;

  @Column({ type: 'text', nullable: true })
  trigger: string | null;

  @Column({ type: 'text', nullable: true })
  text_box_content: string | null;

  @Column({ type: 'jsonb', nullable: true })
  documents_to_attach: string[] | null;

  @Column({ type: 'bigint', nullable: false })
  run_id: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => DisputeCase, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_case_id' })
  dispute_case: DisputeCase;
}
