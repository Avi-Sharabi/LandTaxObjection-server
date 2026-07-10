import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { ValuationNotice } from '../../valuation-notices/entities/valuation-notice.entity';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';

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

@Entity('properties')
export class Property {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'client_id' })
  client_id: string;

  @Column({ type: 'text', nullable: false })
  address: string;

  @Column({ type: 'text', nullable: false })
  suburb: string;

  @Column({ type: 'enum', enum: Jurisdiction, nullable: false })
  state: Jurisdiction;

  @Column({ type: 'text', nullable: true })
  pid: string;

  @Column({ type: 'text', nullable: false })
  postcode: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  ownership_pct: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  land_area_sqm: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  land_area_eplanning_sqm: number | null;

  @Column({ type: 'text', nullable: true })
  zoning: string;

  @Column({ type: 'text', nullable: true })
  lot_dp: string | null;

  @Column({ type: 'text', nullable: true })
  dimensions: string | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  height_limit_m: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Relations
  @ManyToOne(() => Client, (client) => client.properties, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @OneToMany(() => ValuationNotice, (notice) => notice.property)
  valuation_notices: ValuationNotice[];

  @OneToMany(() => DisputeCase, (disputeCase) => disputeCase.property)
  dispute_cases: DisputeCase[];
}
