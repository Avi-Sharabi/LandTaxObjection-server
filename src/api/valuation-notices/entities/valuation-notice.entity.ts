import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Property } from '../../properties/entities/property.entity';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';
import { AssessmentDocument } from '../../dispute-cases/entities/assessment-document.entity';

@Entity('valuation_notices')
export class ValuationNotice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'property_id' })
  property_id: string;

  @Column({ type: 'date', nullable: false })
  valuation_date: Date;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: false })
  assessed_land_value: number;

  @Column({ type: 'numeric', precision: 6, scale: 3, nullable: true })
  benchmark_uplift_pct: number;

  @Column({ type: 'text', nullable: true })
  notice_reference: string | null;

  @Column({ type: 'text', nullable: true })
  file_path: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'source_document_id' })
  source_document_id: string | null;

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
