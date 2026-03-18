import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';

export enum ConstraintType {
  HERITAGE_LISTING                   = 'heritage_listing',
  FLOOD_ZONE_100YR                   = 'flood_zone_100yr',
  BUSHFIRE_BAL_RESTRICTION           = 'bushfire_bal_restriction',
  EASEMENT_OR_RIGHT_OF_WAY           = 'easement_or_right_of_way',
  ENVIRONMENTAL_CONSERVATION_OVERLAY = 'environmental_conservation_overlay',
  ZONING_PLANNING_RESTRICTION        = 'zoning_planning_restriction',
  ACCESS_RESTRICTION_LANDLOCKED      = 'access_restriction_landlocked',
  CONTAMINATION_REMEDIATION          = 'contamination_remediation',
  OTHER                              = 'other',
}

export enum ConstraintDocStatus {
  PENDING_DOCUMENTS  = 'pending_documents',
  DOCUMENTS_UPLOADED = 'documents_uploaded',
  VERIFIED           = 'verified',
}

@Entity('site_constraints')
export class SiteConstraint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK → dispute_cases.id */
  @Column({ type: 'uuid', nullable: false, name: 'dispute_id' })
  dispute_id: string;

  /** Matches schema: constraint_type constraint_type NOT NULL */
  @Column({ type: 'enum', enum: ConstraintType, nullable: false, name: 'constraint_type' })
  constraint_type: ConstraintType;

  /** Matches schema: description TEXT */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Matches schema: legal_argument TEXT */
  @Column({ type: 'text', nullable: true })
  legal_argument: string | null;

  /** Matches schema: document_blob_url TEXT */
  @Column({ type: 'text', nullable: true })
  document_blob_url: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  // ── Relations ─────────────────────────────────────────────────────────────

  @ManyToOne(() => DisputeCase, (d) => d.site_constraints, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dispute_id' })
  dispute: DisputeCase;
}