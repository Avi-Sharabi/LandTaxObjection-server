import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Property } from '../../properties/entities/property.entity';
import { ValuationNotice } from '../../valuation-notices/entities/valuation-notice.entity';
import { User } from '../../users/entities/user.entity';
import { DisputeLegalGround } from '../../dispute-legal-grounds/entities/dispute-legal-ground.entity';
import { ComparableSale } from '../../comparables/entities/comparable-sale.entity';
import { DisputeConstraint } from '../../dispute-constraints/entities/dispute-constraint.entity';

// Declared in lifecycle order — the PostgreSQL enum is created in this same order, so
// enumsortorder matches the lifecycle. Labels, ordering metadata, the legal-transition graph
// and every derived status set live in ../dispute-status.ts; that module imports this enum, so
// nothing in this file may import from it (it would be a cycle).
//
// The lifecycle is CYCLIC: AI_FURTHER_SUBMISSION re-enters the VG loop at
// VG_RESPONSE_RECEIVED. Never reason about "progress" with an index comparison — use the
// set predicates and DISPUTE_STATUS_TRANSITIONS exported from ../dispute-status.ts.
export enum DisputeStatus {
  CREATED = 'created',
  TNC_AGREED = 'tnc_agreed',
  REPORTS_UPLOADED = 'reports_uploaded',
  ANALYSED = 'analysed',
  OBJECTION_SUBMITTED = 'objection_submitted',
  VG_RESPONSE_RECEIVED = 'vg_response_received',
  AI_FURTHER_SUBMISSION = 'ai_further_submission',
  VG_AGREED = 'vg_agreed',
  CASE_CLOSED = 'case_closed',
}

export enum OutcomeResult {
  UPHELD = 'upheld',
  PARTIALLY_UPHELD = 'partially_upheld',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

export enum Jurisdiction {
  NSW = 'NSW',
  VIC = 'VIC',
  QLD = 'QLD',
  WA = 'WA',
  SA = 'SA',
  TAS = 'TAS',
  ACT = 'ACT',
  NT = 'NT',
}

@Entity('dispute_cases')
export class DisputeCase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false, unique: true })
  case_reference: string;

  @Index('idx_dispute_cases_client')
  @Column({ type: 'uuid', nullable: false, name: 'client_id' })
  client_id: string;

  @Column({ type: 'uuid', nullable: false, name: 'property_id' })
  property_id: string;

  @Column({ type: 'uuid', nullable: false, name: 'valuation_notice_id' })
  valuation_notice_id: string;

  @Column({ type: 'uuid', nullable: true, name: 'assigned_accountant_id' })
  assigned_accountant_id: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'assigned_lawyer_id' })
  assigned_lawyer_id: string | null;

  @Column({ type: 'enum', enum: Jurisdiction, nullable: false })
  jurisdiction: Jurisdiction;

  @Index()
  @Column({
    type: 'enum',
    enum: DisputeStatus,
    nullable: false,
    default: DisputeStatus.CREATED,
  })
  status: DisputeStatus;

  @Column({ type: 'date', nullable: false })
  statutory_deadline: Date;

  @Column({ type: 'boolean', nullable: false, default: false })
  no_legal_ground_flagged: boolean;

  @Column({ type: 'boolean', nullable: false, default: false })
  deadline_lapsed_flagged: boolean;

  @Column({ type: 'boolean', nullable: false, default: false })
  flag_heritage: boolean;

  @Column({ type: 'boolean', nullable: false, default: false })
  flag_easement: boolean;

  @Column({ type: 'boolean', nullable: false, default: false })
  flag_flood_zone: boolean;

  @Column({ type: 'boolean', nullable: false, default: false })
  flag_environmental: boolean;

  @Column({ type: 'boolean', nullable: false, default: false })
  flag_zoning: boolean;

  @Column({ type: 'boolean', nullable: false, default: false })
  is_valuated: boolean;

  @Column({ type: 'smallint', nullable: true })
  evidence_strength_score: number | null;

  @Column({ type: 'enum', enum: OutcomeResult, nullable: true })
  outcome: OutcomeResult | null;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  invoice_amount: number | null;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  original_assessed_value: number | null;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  final_agreed_value: number | null;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  tax_saving_achieved: number | null;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: false,
    default: 20,
  })
  yml_fee_share_pct: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  tax_saving: number | null;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  yml_revenue: number | null;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  client_savings: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  submitted_at: Date | null;

  @Column({ type: 'text', nullable: true })
  lodgment_reference_number: string | null;

  @Column({ type: 'smallint', nullable: false, default: 0 })
  vg_follow_up_count: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_vg_follow_up_sent_at: Date | null;

  // Most recent YML further submission. Kept separate from submitted_at so the original
  // lodgement date (cited by the valuation report) survives every resubmission round.
  @Column({ type: 'timestamptz', nullable: true })
  resubmitted_at: Date | null;

  @Column({ type: 'smallint', nullable: false, default: 0 })
  resubmission_count: number;

  @Column({ type: 'timestamptz', nullable: true })
  closed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  analysis_report_blob_path: string | null;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  internal_assessed_value: number | null;

  // vg_response_notes was dropped by 1786000000000. What a VG response said now lives on the
  // audit row that records it (audit_logs.notes), so a specific response's notes can be told
  // apart — a single per-case blob could not, once a case started cycling between
  // vg_response_received and ai_further_submission.

  @Column({ type: 'uuid', nullable: true })
  advisory_view_token: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  advisory_view_token_expires_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deleted_at: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deleted_by: string | null;

  // Relations
  @ManyToOne(() => Client, (client) => client.dispute_cases, {
    nullable: false,
  })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Property, (property) => property.dispute_cases, {
    nullable: false,
  })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @ManyToOne(() => ValuationNotice, (notice) => notice.dispute_cases, {
    nullable: false,
  })
  @JoinColumn({ name: 'valuation_notice_id' })
  valuation_notice: ValuationNotice;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'assigned_accountant_id' })
  assigned_accountant: User;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'assigned_lawyer_id' })
  assigned_lawyer: User;

  @OneToMany(() => DisputeLegalGround, (ground) => ground.dispute)
  legal_grounds: DisputeLegalGround[];

  @OneToMany(() => ComparableSale, (comparable) => comparable.dispute_case)
  comparables: ComparableSale[];

  @OneToMany(() => DisputeConstraint, (constraint) => constraint.dispute)
  dispute_constraints: DisputeConstraint[];
}
