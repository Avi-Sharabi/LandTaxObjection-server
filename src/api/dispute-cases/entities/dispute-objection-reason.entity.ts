import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DisputeCase } from './dispute-case.entity';

@Entity('dispute_objection_reasons')
export class DisputeObjectionReason {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'dispute_case_id' })
  dispute_case_id: string;

  @Column({ type: 'int', nullable: false, name: 'ground_number' })
  ground_number: number;

  @Column({ type: 'text', nullable: false })
  label: string;

  @Column({ type: 'boolean', nullable: false, default: false, name: 'is_tick' })
  is_tick: boolean;

  @Column({ type: 'text', nullable: true, name: 'concession_type' })
  concession_type: string | null;

  @Column({ type: 'text', nullable: true, name: 'concession_type_note' })
  concession_type_note: string | null;

  // 'PORTAL_TYPE' when concession_type is a genuine match from the VG portal's fixed radio-button
  // list; 'NO_MATCHING_PORTAL_TYPE' when the true finding (e.g. a flood/environmental constraint
  // discount) has no corresponding portal option — concession_type stays null in that case rather
  // than being force-mapped onto an unrelated section.
  @Column({ type: 'text', nullable: true, name: 'concession_classification' })
  concession_classification: string | null;

  // 'AI_DETECTED_UNVERIFIED' | 'EVIDENCE_OBTAINED' | 'CLIENT_CONFIRMED' — distinct from confidence:
  // this records whether the finding has actually been corroborated, not how confident the model is.
  @Column({ type: 'text', nullable: true, name: 'verification_status' })
  verification_status: string | null;

  @Column({ type: 'text', nullable: true })
  analysis: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'evidence_files' })
  evidence_files: string[] | null;

  @Column({
    type: 'bigint',
    nullable: false,
    // node-postgres returns bigint as string; transformer keeps the TypeScript type as number
    transformer: { from: (v: string) => Number(v), to: (v: number) => v },
  })
  run_id: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => DisputeCase, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_case_id' })
  dispute_case: DisputeCase;
}
