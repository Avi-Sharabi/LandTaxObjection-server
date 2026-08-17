import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * NSW VG area unit of measure.
 *  M = square metres
 *  H = hectares
 */
export enum AreaType {
  SQUARE_METRES = 'M',
  HECTARES = 'H',
}

/**
 * Postgres returns NUMERIC as string to preserve precision.
 * This transformer surfaces them as JS numbers on read.
 * Drop it (and type the fields as `string`) if you need exact decimal math.
 */
const numericTransformer = {
  to: (value?: number | null) => value ?? null,
  from: (value?: string | null) =>
    value === null || value === undefined ? null : parseFloat(value),
};

/**
 * Mirrors `property_sales_raw` as it exists in QA and production.
 *
 * `synchronize: false` is load-bearing, not decoration: data-source.ts globs `src/**\/*.entity.ts`,
 * so without it `migration:generate` would emit DDL for a table this repo does not own and that
 * holds ~2.3M production rows. The flag excludes this entity from schema sync and migration
 * diffing.
 *
 * A consequence worth stating plainly: **nothing below is enforced by this file.** The `@Index` and
 * `@Unique` declarations, the varchar lengths and the numeric precisions are all *descriptions* of
 * what the live table is believed to have — Postgres alone enforces the real ones. If any of them
 * is wrong, the error is in this documentation, not in behaviour, and it will not surface as a
 * failure. Confirm with `\d property_sales_raw` against QA before trusting them at face value.
 *
 * `uq_psr_dealing_number` is real, and it is why the weekly import cannot store every row it parses:
 * one NSW land-title dealing routinely covers several properties. AW174310 in the 03 Aug 2026 bundle
 * is a single $11,600,820 sale recorded as 28 property rows across 12 suburbs and 8 district files.
 * `PsiImportRepository.insertSaleRecords` inserts with `ON CONFLICT DO NOTHING` and counts what the
 * constraint rejects — see the doc comment there for the trade being made.
 */
@Entity({ name: 'property_sales_raw', synchronize: false })
@Unique('uq_psr_dealing_number', ['dealingNumber'])
@Index('idx_psr_locality_date', ['propertyLocality', 'contractDate'])
@Index('idx_psr_post_code', ['propertyPostCode'])
@Index('idx_psr_contract_date', ['contractDate'])
@Index('idx_psr_district_code', ['districtCode'])
@Index('idx_psr_zoning', ['zoning'])
@Index('idx_psr_nature', ['natureOfProperty'])
@Index('idx_psr_purchase_price', ['purchasePrice'])
@Index('idx_psr_source_file', ['sourceFile'])
@Index('idx_psr_imported_at', ['importedAt'])
export class PropertySalesRaw {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  // ── Import metadata ──────────────────────────────────────────
  @Column({ name: 'source_file', type: 'varchar', length: 255 })
  sourceFile: string;

  @CreateDateColumn({
    name: 'imported_at',
    type: 'timestamptz',
    default: () => 'NOW()',
  })
  importedAt: Date;

  // ── Identifiers ──────────────────────────────────────────────
  @Column({
    name: 'district_code',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  districtCode: string | null;

  @Column({ name: 'property_id', type: 'varchar', length: 50, nullable: true })
  propertyId: string | null;

  @Column({ name: 'sale_counter', type: 'smallint', nullable: true })
  saleCounter: number | null;

  @Column({ name: 'download_datetime', type: 'timestamptz', nullable: true })
  downloadDatetime: Date | null;

  // ── Address ──────────────────────────────────────────────────
  @Column({
    name: 'property_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  propertyName: string | null;

  @Column({
    name: 'property_unit_number',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  propertyUnitNumber: string | null;

  @Column({
    name: 'property_house_number',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  propertyHouseNumber: string | null;

  @Column({
    name: 'property_street_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  propertyStreetName: string | null;

  @Column({
    name: 'property_locality',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  propertyLocality: string | null;

  @Column({
    name: 'property_post_code',
    type: 'char',
    length: 4,
    nullable: true,
  })
  propertyPostCode: string | null;

  // ── Land ─────────────────────────────────────────────────────
  @Column({
    name: 'area',
    type: 'numeric',
    precision: 15,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  area: number | null;

  @Column({
    name: 'area_type',
    type: 'enum',
    enum: AreaType,
    enumName: 'area_type_enum',
    nullable: true,
  })
  areaType: AreaType | null;

  // ── Transaction ──────────────────────────────────────────────
  @Column({ name: 'contract_date', type: 'date', nullable: true })
  contractDate: string | null;

  @Column({ name: 'settlement_date', type: 'date', nullable: true })
  settlementDate: string | null;

  @Column({
    name: 'purchase_price',
    type: 'numeric',
    precision: 15,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  purchasePrice: number | null;

  // ── Classification (VARCHAR until profiled — see schema notes) ─
  @Column({ name: 'zoning', type: 'varchar', length: 20, nullable: true })
  zoning: string | null;

  @Column({
    name: 'nature_of_property',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  natureOfProperty: string | null;

  @Column({
    name: 'primary_purpose',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  primaryPurpose: string | null;

  // ── Codes ────────────────────────────────────────────────────
  @Column({
    name: 'strata_lot_number',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  strataLotNumber: string | null;

  @Column({
    name: 'component_code',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  componentCode: string | null;

  @Column({ name: 'sale_code', type: 'varchar', length: 20, nullable: true })
  saleCode: string | null;

  @Column({
    name: 'interest_of_sale_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  interestOfSalePercent: number | null;

  @Column({
    name: 'dealing_number',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  dealingNumber: string | null;

  @Column({ name: 'owner_type', type: 'varchar', length: 50, nullable: true })
  ownerType: string | null;
}
