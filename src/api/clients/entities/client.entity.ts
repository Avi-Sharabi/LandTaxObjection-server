import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Property } from '../../properties/entities/property.entity';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';

export enum ClientStatus {
  PROSPECT = 'prospect',
  TC_NEGOTIATION = 'tc_negotiation',
  ACTIVE = 'active',
  REJECTED = 'rejected',
}


@Entity('clients')
export class Client {
  // ─── Core ────────────────────────────────────────────────────────────────────

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ClientStatus, nullable: false, default: ClientStatus.PROSPECT })
  status: ClientStatus;

  // ─── Identity (matches FYI field names) ──────────────────────────────────────

  @Column({ type: 'text', nullable: false })
  name: string;                    // FYI: name

  @Column({ type: 'text', nullable: true })
  email: string;                   // FYI: email

  @Column({ type: 'text', nullable: true })
  phone: string;                   // FYI: phone

  @Column({ type: 'text', nullable: true })
  mobile: string;                  // FYI: mobile

  // ─── Address (matches FYI field names) ───────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  address: string;                 // FYI: address

  @Column({ type: 'text', nullable: true })
  city: string;                    // FYI: city

  @Column({ type: 'text', nullable: true })
  region: string;                  // FYI: region

  @Column({ type: 'text', nullable: true })
  postcode: string;                // FYI: postcode

  @Column({ type: 'text', nullable: true })
  country: string;                 // FYI: country

  // ─── Business (matches FYI field names) ──────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  business_number: string;         // FYI: business_number

  @Column({ type: 'text', nullable: true })
  company_number: string;          // FYI: company_number

  @Column({ type: 'text', nullable: true })
  client_code: string;             // FYI: details.client_code

  @Column({ type: 'text', nullable: true })
  source: string;                  // FYI: source (e.g. "xpm")

  @Column({ type: 'text', nullable: true })
  source_id: string;               // FYI: source_id

  // ─── FYI Metadata ────────────────────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  fyi_id: string | null;           // FYI: id

  @Column({ type: 'text', nullable: true })
  fyi_uuid: string | null;         // FYI: details.uuid

  @Column({ type: 'text', nullable: true })
  fyi_manager_email: string | null; // FYI: manager_user.email

  @Column({ type: 'text', nullable: true })
  fyi_partner_email: string | null; // FYI: partner_user.email

  // ─── Internal ────────────────────────────────────────────────────────────────

  @Column({ type: 'uuid', nullable: true, name: 'assigned_accountant_id' })
  assigned_accountant_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  tc_accepted_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // ─── Relations ───────────────────────────────────────────────────────────────

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'assigned_accountant_id' })
  assigned_accountant: User;

  @OneToMany(() => Property, (property) => property.client)
  properties: Property[];

  @OneToMany(() => DisputeCase, (disputeCase) => disputeCase.client)
  dispute_cases: DisputeCase[];
}