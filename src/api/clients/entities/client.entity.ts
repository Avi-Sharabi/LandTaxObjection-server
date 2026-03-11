import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
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
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false })
  name: string;

  @Column({ type: 'text', nullable: true })
  abn: string;

  @Column({ type: 'text', nullable: true })
  contact_email: string;

  @Column({ type: 'text', nullable: true })
  contact_phone: string;

  @Column({ type: 'enum', enum: ClientStatus, nullable: false, default: ClientStatus.PROSPECT })
  status: ClientStatus;

  @Column({ type: 'uuid', nullable: true, name: 'assigned_accountant_id' })
  assigned_accountant_id: string | null;

  @Column({ type: 'text', nullable: true })
  fyi_client_id: string | null;

  @Column({ type: 'text', nullable: true })
  valuation_blob_url: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  tc_accepted_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'assigned_accountant_id' })
  assigned_accountant: User;

  @OneToMany(() => Property, (property) => property.client)
  properties: Property[];

  @OneToMany(() => DisputeCase, (disputeCase) => disputeCase.client)
  dispute_cases: DisputeCase[];
}
