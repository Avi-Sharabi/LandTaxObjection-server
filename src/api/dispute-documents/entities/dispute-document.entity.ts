import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';
import { User } from '../../users/entities/user.entity';

export enum DocumentType {
  VALUATION_NOTICE      = 'valuation_notice',
  LAND_TAX_ASSESSMENT   = 'land_tax_assessment',
  LAND_TITLE_SEARCH     = 'land_title_search',
  INDEPENDENT_VALUATION = 'independent_valuation',
  PROPERTY_REPORT       = 'property_report',
  PHOTOGRAPH            = 'photograph',
  LEGAL_DOCUMENT        = 'legal_document',
  GENERATED_OBJECTION   = 'generated_objection',
  ADVISORY_LETTER       = 'advisory_letter',
  OTHER                 = 'other',
}

@Entity('dispute_documents')
export class DisputeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'dispute_id' })
  dispute_id: string;

  @Column({ type: 'enum', enum: DocumentType, nullable: false, name: 'document_type' })
  document_type: DocumentType;

  @Column({ type: 'text', nullable: false })
  filename: string;

  @Column({ type: 'text', nullable: false })
  blob_storage_url: string;

  @Column({ type: 'uuid', nullable: true, name: 'uploaded_by' })
  uploaded_by: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'uploaded_at' })
  uploaded_at: Date;

  // ── Relations ─────────────────────────────────────────────────────────────

  @ManyToOne(() => DisputeCase, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_id' })
  dispute: DisputeCase;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User;
}