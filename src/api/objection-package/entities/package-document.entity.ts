import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';

export enum PackageDocumentCategory {
  NOTICE_OF_OBJECTION = 'notice_of_objection',
  COMPARABLE_SALES_REPORT = 'comparable_sales_report',
  MASS_APPRAISAL_DEVIATION = 'mass_appraisal_deviation_report',
  SITE_CONSTRAINTS_SUMMARY = 'site_constraints_summary',
  SUPPORTING_UPLOADS = 'supporting_uploads',
}

export enum PackageDocumentStatus {
  READY = 'ready',
  MISSING = 'missing',
  PENDING = 'pending',
}

@Entity('package_documents')
export class PackageDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'dispute_case_id' })
  dispute_case_id: string;

  @Column({ type: 'text', nullable: false })
  name: string;

  @Column({ type: 'enum', enum: PackageDocumentCategory, nullable: false })
  category: PackageDocumentCategory;

  @Column({
    type: 'enum',
    enum: PackageDocumentStatus,
    nullable: false,
    default: PackageDocumentStatus.PENDING,
  })
  status: PackageDocumentStatus;

  @Column({ type: 'text', nullable: true })
  blob_name: string | null;

  @Column({ type: 'integer', nullable: true, name: 'file_size_bytes' })
  file_size_bytes: number | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'generated_at' })
  generated_at: Date | null;

  @ManyToOne(() => DisputeCase, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_case_id' })
  dispute_case: DisputeCase;
}
