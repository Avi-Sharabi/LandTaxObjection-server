import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SiteConstraint } from './site-constraints.entity';

@Entity('site_constraint_documents')
export class SiteConstraintDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'constraint_id' })
  constraint_id: string;

  @Column({ type: 'text', nullable: false, name: 'blob_path' })
  blob_path: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'uploaded_at' })
  uploaded_at: Date;

  @ManyToOne(() => SiteConstraint, (c) => c.documents, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'constraint_id' })
  constraint: SiteConstraint;
}
