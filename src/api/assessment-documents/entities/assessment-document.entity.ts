import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { ValuationNotice } from '../../valuation-notices/entities/valuation-notice.entity';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';

/**
 * Deliberately the same vocabulary the PDF classifier already emits
 * (src/api/supporting-evidence/shared/pdf-extractor.service.ts), so the two never disagree.
 * Its `unknown` verdict maps to NULL here rather than to a member — an unclassified document must
 * not count towards the reports-uploaded gate.
 */
export enum AssessmentDocumentType {
  LAND_TAX_NOTICE = 'land_tax_notice',
  BENCHMARK_REPORT = 'benchmark_report',
  SALES_REPORT = 'sales_report',
  LAND_VALUE_SEARCH = 'land_value_search',
}

/**
 * Display wording. Kept beside the enum so the phrasing in a transition blocker message matches
 * the frontend's ASSESSMENT_DOCUMENT_TYPE_LABELS instead of leaking a raw snake_case value.
 */
export const ASSESSMENT_DOCUMENT_TYPE_LABELS: Record<
  AssessmentDocumentType,
  string
> = {
  [AssessmentDocumentType.LAND_VALUE_SEARCH]: 'Land value search',
  [AssessmentDocumentType.SALES_REPORT]: 'Sales report',
  [AssessmentDocumentType.BENCHMARK_REPORT]: 'Benchmark report',
  [AssessmentDocumentType.LAND_TAX_NOTICE]: 'Land tax notice',
};

/**
 * Both must be on file, with an uploaded blob, before a case counts as
 * "Land value and sales report uploaded".
 *
 * BENCHMARK_REPORT used to stand where SALES_REPORT does now. It remains a valid type to upload
 * and classify — it simply no longer gates the transition. Changing this list is all that is
 * needed: it is passed as a query parameter (see AssessmentDocumentsRepository), never baked
 * into the schema, so no migration is involved.
 */
export const REPORTS_UPLOADED_REQUIRED_TYPES: readonly AssessmentDocumentType[] =
  [
    AssessmentDocumentType.LAND_VALUE_SEARCH,
    AssessmentDocumentType.SALES_REPORT,
  ];

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

  /**
   * What kind of document this is. Nullable because it is unknowable for anything uploaded before
   * the field existed, and because an unclassified document must not be able to satisfy the
   * "land value and sales report uploaded" gate.
   *
   * The vocabulary matches the classifier in
   * src/api/supporting-evidence/shared/pdf-extractor.service.ts on purpose — a second spelling of
   * the same concept would drift.
   */
  @Column({ type: 'text', nullable: true })
  document_type: AssessmentDocumentType | null;

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
