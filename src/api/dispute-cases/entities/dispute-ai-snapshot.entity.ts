import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DisputeCase } from './dispute-case.entity';
import { SupportingEvidenceContext } from '../../supporting-evidence/supporting-evidence.types';

type SnapshotContext = Omit<SupportingEvidenceContext, 'reportBuffer'>;

// 'ground_analysis' (default) — skips ePlanning/comparables/evidence gathering, runs the real
//   ground-generation LLM call unconditionally, and skips valuation report generation entirely.
// 'report_generation' — skips the ground-generation LLM call too (grounds must be pre-seeded
//   directly into dispute_objection_reasons) and, unlike 'ground_analysis', DOES run
//   valuationReportService.generate(). See analyze-ai.processor.ts's snapshot guards.
export type DisputeAiSnapshotMode = 'ground_analysis' | 'report_generation';

@Entity('dispute_ai_snapshots')
export class DisputeAiSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, unique: true, name: 'dispute_case_id' })
  dispute_case_id: string;

  @Column({ type: 'jsonb', nullable: false })
  context: SnapshotContext;

  @Column({
    type: 'text',
    nullable: false,
    default: 'ground_analysis',
    name: 'snapshot_mode',
  })
  snapshot_mode: DisputeAiSnapshotMode;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => DisputeCase, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_case_id' })
  dispute_case: DisputeCase;
}
