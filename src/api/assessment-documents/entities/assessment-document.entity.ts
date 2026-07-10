import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { ValuationNotice } from '../../valuation-notices/entities/valuation-notice.entity';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';

@Entity('assessment_documents')
export class AssessmentDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'client_id' })
  client_id: string;

  @Column({ type: 'text', nullable: false })
  document_name: string;

  @Column({ type: 'text', nullable: true })
  file_path: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @Column({ type: 'uuid', nullable: true, name: 'dispute_case_id' })
  dispute_case_id: string | null;

  // Relations
  @ManyToOne(() => Client, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => DisputeCase, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dispute_case_id' })
  dispute_case: DisputeCase | null;

  @OneToMany(() => ValuationNotice, (notice) => notice.source_document)
  valuation_notices: ValuationNotice[];
}
