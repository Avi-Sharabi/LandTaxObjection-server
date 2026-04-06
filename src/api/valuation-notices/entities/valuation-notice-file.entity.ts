import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ValuationNotice } from './valuation-notice.entity';
import { User } from '../../users/entities/user.entity';

export enum UploadStatus {
  PENDING = 'pending',
  SCANNING = 'scanning',
  COMPLETE = 'complete',
  FAILED = 'failed',
  REJECTED = 'rejected',
}

export enum UploadedByRole {
  CLIENT = 'client',
  STAFF = 'staff',
  STAFF_ON_BEHALF_OF_CLIENT = 'staff_on_behalf_of_client',
}

@Entity('valuation_notice_files')
export class ValuationNoticeFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'valuation_notice_id' })
  valuation_notice_id: string;

  @Column({ type: 'text', nullable: false })
  blob_path: string;

  @Column({ type: 'text', nullable: false })
  original_name: string;

  @Column({ type: 'text', nullable: false })
  mime_type: string;

  @Column({ type: 'int', nullable: false })
  file_size_bytes: number;

  @Column({ type: 'enum', enum: UploadStatus, nullable: false, default: UploadStatus.PENDING })
  upload_status: UploadStatus;

  @Column({ type: 'uuid', nullable: false, name: 'uploaded_by' })
  uploaded_by: string;

  @Column({ type: 'enum', enum: UploadedByRole, nullable: false, name: 'uploaded_by_role' })
  uploaded_by_role: UploadedByRole;

  @Column({ type: 'uuid', nullable: true, name: 'confirmed_by' })
  confirmed_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmed_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'uploaded_at' })
  uploaded_at: Date;

  // Relations
  @ManyToOne(() => ValuationNotice, (notice) => notice.files, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'valuation_notice_id' })
  valuation_notice: ValuationNotice;

  @ManyToOne(() => User, { nullable: false, eager: false })
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'confirmed_by' })
  confirmer: User | null;
}