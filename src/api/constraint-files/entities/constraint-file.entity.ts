import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DisputeConstraint } from '../../dispute-constraints/entities/dispute-constraint.entity';
import { ConstraintType } from '../../dispute-constraints/entities/constraint-type.enum';
import { UploadStatus, UploadedByRole } from '../../valuation-notices/entities/valuation-notice-file.entity';
import { User } from '../../users/entities/user.entity';

@Entity('constraint_files')
export class ConstraintFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'dispute_constraint_id' })
  dispute_constraint_id: string;

  @Column({ type: 'enum', enum: ConstraintType, nullable: false, name: 'document_category' })
  document_category: ConstraintType;

  @Column({ type: 'text', nullable: false })
  blob_path: string;

  @Column({ type: 'text', nullable: false })
  original_name: string;

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
  @ManyToOne(() => DisputeConstraint, (constraint) => constraint.files, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_constraint_id' })
  dispute_constraint: DisputeConstraint;

  @ManyToOne(() => User, { nullable: false, eager: false })
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'confirmed_by' })
  confirmer: User | null;
}
