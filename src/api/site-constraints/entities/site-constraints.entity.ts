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

  @Column({ type: 'uuid', nullable: false, name: 'dispute_id' })
  dispute_id: string;

  @Column({ type: 'enum', enum: ConstraintType, nullable: false, name: 'constraint_type' })
  constraints_type: ConstraintType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  legal_argument: string | null;

  @Column({ type: 'text', nullable: true })
  document_blob_url: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => DisputeCase, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_id' })
  dispute: DisputeCase;
}