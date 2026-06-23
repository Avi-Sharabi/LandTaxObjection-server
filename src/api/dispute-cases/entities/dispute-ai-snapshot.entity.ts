import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DisputeCase } from './dispute-case.entity';
import { SupportingEvidenceContext } from '../../supporting-evidence/supporting-evidence.types';

type SnapshotContext = Omit<SupportingEvidenceContext, 'reportBuffer'>;

@Entity('dispute_ai_snapshots')
export class DisputeAiSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, unique: true, name: 'dispute_case_id' })
  dispute_case_id: string;

  @Column({ type: 'jsonb', nullable: false })
  context: SnapshotContext;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => DisputeCase, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_case_id' })
  dispute_case: DisputeCase;
}
