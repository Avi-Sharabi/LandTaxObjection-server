import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { ValuationNotice } from '../../valuation-notices/entities/valuation-notice.entity';

@Entity('assessment_documents')
export class AssessmentDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'client_id' })
  client_id: string;

  @Column({ type: 'text', nullable: true })
  file_path: string | null;

  @Column({ type: 'date', nullable: false })
  notice_date: Date;

  @Column({ type: 'text', nullable: false })
  valuation_year: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Relations
  @ManyToOne(() => Client, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @OneToMany(() => ValuationNotice, (notice) => notice.source_document)
  valuation_notices: ValuationNotice[];
}
