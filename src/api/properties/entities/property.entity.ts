import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
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

// Declared here as well as in 1784400000000-AddPropertyAddressNormalized.ts so that
// `migration:generate` doesn't see them as stray database-only indexes and emit a DROP for both.
@Index('IDX_properties_client_state_address_normalized', ['client_id', 'state', 'address_normalized'])
@Index('IDX_properties_client_pid', ['client_id', 'pid'], { where: '"pid" IS NOT NULL' })
@Entity('properties')
export class Property {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'client_id' })
  client_id: string;

  @Column({ type: 'text', nullable: false })
  address: string;

  /**
   * Postgres STORED generated column — the comparison key intake uses to decide whether a
   * submitted property already exists for this client. Maintained entirely by the database so it
   * cannot drift when `address` is changed through PATCH /properties/:id.
   *
   * `asExpression` must stay byte-identical to ADDRESS_NORMALIZED_EXPRESSION in
   * 1784400000000-AddPropertyAddressNormalized.ts (which also registers it in `typeorm_metadata`)
   * and semantically identical to `normalizePropertyAddress()` in
   * src/common/utils/address-parser.util.ts. TypeORM compares this string against the
   * typeorm_metadata row, so drift shows up as a phantom ALTER in the next generated migration.
   */
  @Column({
    type: 'text',
    nullable: true,
    generatedType: 'STORED',
    asExpression: `regexp_replace(btrim(regexp_replace(upper(address), '[^A-Z0-9]+', ' ', 'g')), '( |^)(NSW|VIC|QLD|WA|SA|TAS|ACT|NT) [0-9]{4}$', '')`,
    insert: false,
    update: false,
  })
  address_normalized: string;

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
