import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Property } from '../../properties/entities/property.entity';
import { ValuationNotice } from '../../valuation-notices/entities/valuation-notice.entity';
import { User } from '../../users/entities/user.entity';
import { DisputeLegalGround } from '../../dispute-legal-grounds/entities/dispute-legal-ground.entity';
import { ComparableSale } from '../../comparables/entities/comparable-sale.entity';
import { DisputeConstraint } from '../../dispute-constraints/entities/dispute-constraint.entity';

export enum DisputeStatus {
  DRAFT = 'draft',
  GROUNDS_SELECTION = 'grounds_selection',
  EVIDENCE_COMPILATION = 'evidence_compilation',
  APPRAISAL = 'appraisal',
  ADVISORY_LETTER_ISSUED = 'advisory_letter_issued',
  OBJECTION_PACKAGE_PREPARED = 'objection_package_prepared',
  AWAITING_CLIENT_APPROVAL = 'awaiting_client_approval',
  CLIENT_APPROVED = 'client_approved',
  SUBMITTED_TO_VG = 'submitted_to_vg',
  AWAITING_VG_RESPONSE = 'awaiting_vg_response',
  VG_RESPONSE_RECEIVED = 'vg_response_received',
  OUTCOME_RECEIVED = 'outcome_received',
  CLOSED = 'closed',
  CLOSED_NO_OBJECTION = 'closed_no_objection',
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
}


@Entity('dispute_cases')
export class DisputeCase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false, unique: true })
  case_reference: string;

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

  @Column({ type: 'enum', enum: DisputeStatus, nullable: false, default: DisputeStatus.DRAFT })
  status: DisputeStatus;

  @Column({ type: 'date', nullable: false })
  statutory_deadline: Date;

  @Column({ type: 'boolean', nullable: false, default: false })
  no_legal_ground_flagged: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  client_approval_requested_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  client_approved_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  client_approval_token: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  client_approval_token_expires_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_reminder_sent_at: Date | null;

  @Column({ type: 'smallint', nullable: false, default: 0 })
  reminder_count: number;

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

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  submitted_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  closed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  advisory_letter_url: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  vg_response_received_at: Date | null;

  @Column({ type: 'text', nullable: true })
  lodgment_reference_number: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => Client, (client) => client.dispute_cases, { nullable: false })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Property, (property) => property.dispute_cases, { nullable: false })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @ManyToOne(() => ValuationNotice, (notice) => notice.dispute_cases, { nullable: false })
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
