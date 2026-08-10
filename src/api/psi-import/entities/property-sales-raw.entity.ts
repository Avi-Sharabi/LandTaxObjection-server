import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * Read-only mapping of the externally-managed `property_sales_raw` table.
 *
 * This table was created out-of-band — no migration in this repo defines it, and every other
 * consumer (comparables.service.ts, search-comparables.tool.ts) reaches it through raw SQL.
 *
 * `synchronize: false` at the entity level is load-bearing, not decoration: data-source.ts globs
 * `src/**\/*.entity.ts`, so without it the next `migration:generate` would emit a
 * `CREATE TABLE property_sales_raw` against a table that already exists and holds real data.
 * The flag excludes this entity from both schema sync and migration diffing.
 *
 * Column types mirror the block commented `// ── property_sales_raw fields ──` in
 * comparable-sale.entity.ts, which is the closest thing to a schema declaration that exists,
 * with two corrections: `area_type` is added (it exists on the source table but was omitted from
 * ComparableSale) and `id` is bigint rather than uuid.
 */
@Entity({ name: 'property_sales_raw', synchronize: false })
export class PropertySalesRaw {
  // bigint, not uuid — proven by the `id != ALL($5::bigint[])` cast in comparables.service.ts.
  // TypeORM maps Postgres bigint to string to avoid precision loss beyond Number.MAX_SAFE_INTEGER.
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', nullable: true })
  source_file: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  imported_at: Date | null;

  @Column({ type: 'varchar', nullable: true })
  district_code: string | null;

  @Column({ type: 'varchar', nullable: true })
  property_id: string | null;

  @Column({ type: 'integer', nullable: true })
  sale_counter: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  download_datetime: Date | null;

  @Column({ type: 'varchar', nullable: true })
  property_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  property_unit_number: string | null;

  @Column({ type: 'varchar', nullable: true })
  property_house_number: string | null;

  @Column({ type: 'varchar', nullable: true })
  property_street_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  property_locality: string | null;

  @Column({ type: 'varchar', nullable: true })
  property_post_code: string | null;

  @Column({ type: 'numeric', precision: 15, scale: 4, nullable: true })
  area: number | null;

  // Authoritative 'H' (hectares) / 'M' (square metres) flag on the source record — see the
  // comment in comparables.service.ts against guessing this from the magnitude of `area`.
  @Column({ type: 'varchar', nullable: true })
  area_type: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  contract_date: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  settlement_date: Date | null;

  @Column({ type: 'numeric', precision: 20, scale: 2, nullable: true })
  purchase_price: number | null;

  @Column({ type: 'varchar', nullable: true })
  zoning: string | null;

  @Column({ type: 'varchar', nullable: true })
  nature_of_property: string | null;

  @Column({ type: 'varchar', nullable: true })
  primary_purpose: string | null;

  @Column({ type: 'varchar', nullable: true })
  strata_lot_number: string | null;

  @Column({ type: 'varchar', nullable: true })
  component_code: string | null;

  @Column({ type: 'varchar', nullable: true })
  sale_code: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true })
  interest_of_sale_percent: number | null;

  @Column({ type: 'varchar', nullable: true })
  dealing_number: string | null;

  @Column({ type: 'varchar', nullable: true })
  owner_type: string | null;
}
