import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Property } from '../../properties/entities/property.entity';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';
import { AssessmentDocument } from '../../dispute-cases/entities/assessment-document.entity';

export enum DecisionOutcome {
  OBJECTION = 'OBJECTION',
  ADVISORY = 'ADVISORY',
}

@Entity('valuation_notices')
export class ValuationNotice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'property_id' })
  property_id: string;

  @Column({ type: 'date', nullable: false })
  valuation_date: Date;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  assessed_land_value: number | null;

  @Column({ type: 'boolean', nullable: false, default: false })
  is_exempt: boolean;

  @Column({ type: 'numeric', precision: 6, scale: 3, nullable: true })
  benchmark_uplift_pct: number;

  @Column({ type: 'text', nullable: true })
  notice_reference: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'source_document_id' })
  source_document_id: string | null;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  appraised_value: number | null;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  valuation_delta: number | null;

  @Column({ type: 'enum', enum: DecisionOutcome, nullable: true })
  decision_outcome: DecisionOutcome | null;

  @Column({ type: 'text', nullable: true })
  analyst_notes: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'appraised_by_id' })
  appraised_by_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  appraised_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Relations
  @ManyToOne(() => Property, (property) => property.valuation_notices, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @ManyToOne(() => AssessmentDocument, (doc) => doc.valuation_notices, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_document_id' })
  source_document: AssessmentDocument;

  @OneToMany(() => DisputeCase, (disputeCase) => disputeCase.valuation_notice)
  dispute_cases: DisputeCase[];
}
