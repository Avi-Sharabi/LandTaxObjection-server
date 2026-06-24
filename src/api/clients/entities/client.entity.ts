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

  // ─── Identity ────────────────────────────────────────────────────────────────

  @Column({ type: 'text', nullable: false })
  name: string;                             // XPM: name

  @Column({ type: 'text', nullable: true })
  title: string | null;                     // XPM: title

  @Column({ type: 'text', nullable: true })
  gender: string | null;                    // XPM: gender

  @Column({ type: 'text', nullable: true })
  first_name: string | null;               // XPM: firstName

  @Column({ type: 'text', nullable: true })
  middle_name: string | null;              // XPM: middleName

  @Column({ type: 'text', nullable: true })
  last_name: string | null;               // XPM: lastName

  @Column({ type: 'text', nullable: true })
  email: string | null;                    // XPM: email

  @Column({ type: 'date', nullable: true })
  date_of_birth: Date | null;              // XPM: dateOfBirth

  @Column({ type: 'text', nullable: true })
  phone: string | null;                    // XPM: phone

  @Column({ type: 'text', nullable: true })
  mobile: string | null;

  @Column({ type: 'text', nullable: true })
  fax: string | null;                      // XPM: fax

  @Column({ type: 'text', nullable: true })
  website: string | null;                  // XPM: website

  // ─── Address ─────────────────────────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  address: string | null;                  // XPM: address

  @Column({ type: 'text', nullable: true })
  city: string | null;                     // XPM: city

  @Column({ type: 'text', nullable: true })
  region: string | null;                   // XPM: region

  @Column({ type: 'text', nullable: true })
  postcode: string | null;                 // XPM: postCode

  @Column({ type: 'text', nullable: true })
  country: string | null;                  // XPM: country

  // ─── Postal Address ───────────────────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  postal_address: string | null;           // XPM: postalAddress

  @Column({ type: 'text', nullable: true })
  postal_city: string | null;              // XPM: postalCity

  @Column({ type: 'text', nullable: true })
  postal_region: string | null;            // XPM: postalRegion

  @Column({ type: 'text', nullable: true })
  postal_postcode: string | null;          // XPM: postalPostCode

  @Column({ type: 'text', nullable: true })
  postal_country: string | null;           // XPM: postalCountry

  // ─── Business / Tax ───────────────────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  business_number: string | null;          // XPM: businessNumber

  @Column({ type: 'text', nullable: true })
  company_number: string | null;           // XPM: companyNumber

  @Column({ type: 'text', nullable: true })
  tax_number: string | null;               // XPM: taxNumber

  @Column({ type: 'text', nullable: true })
  business_structure: string | null;       // XPM: businessStructure

  @Column({ type: 'text', nullable: true })
  tax_agent: string | null;                // XPM: taxAgent

  @Column({ type: 'text', nullable: true })
  agency_status: string | null;            // XPM: agencyStatus

  @Column({ type: 'text', nullable: true })
  referral_source: string | null;          // XPM: referralSource

  // ─── XPM Metadata ────────────────────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  xpm_uuid: string | null;                 // XPM: uuid

  @Column({ type: 'text', nullable: true })
  xpm_account_manager_uuid: string | null; // XPM: accountManager.uuid

  @Column({ type: 'text', nullable: true })
  xpm_account_manager_name: string | null; // XPM: accountManager.name

  @Column({ type: 'text', nullable: true })
  xpm_job_manager_uuid: string | null;     // XPM: jobManager.uuid

  @Column({ type: 'text', nullable: true })
  xpm_job_manager_name: string | null;     // XPM: jobManager.name

  // ─── Internal ────────────────────────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  source: string | null;                   // e.g. "xpm" or "intake_form"

  @Column({ type: 'uuid', nullable: true, name: 'assigned_accountant_id' })
  assigned_accountant_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  tc_accepted_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deleted_at: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deleted_by: string | null;

  // ─── Relations ───────────────────────────────────────────────────────────────

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'assigned_accountant_id' })
  assigned_accountant: User;

  @OneToMany(() => Property, (property) => property.client)
  properties: Property[];

  @OneToMany(() => DisputeCase, (disputeCase) => disputeCase.client)
  dispute_cases: DisputeCase[];
}
