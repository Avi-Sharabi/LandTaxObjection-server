import { Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

const logger = new Logger('PropertySalesRawSeeder');

/**
 * Creates `property_sales_raw` on a local development database, matching QA and production.
 *
 * Unlike every other seeder here, this one creates a table rather than rows — because nothing else
 * in the repository does. `property_sales_raw` was loaded out of band in QA/prod, no migration
 * defines it, and `property-sales-raw.entity.ts` is deliberately `synchronize: false` so TypeORM
 * never emits a CREATE TABLE against it. The upshot is that a fresh `npm run reset` leaves a
 * database where the PSI import dies on its first query with
 * `relation "property_sales_raw" does not exist`, before Puppeteer even launches.
 *
 * Deliberately NOT a migration. `migration:run` executes against prod and QA in the deploy
 * pipeline, and this table already exists there with 2.3M rows. A migration defining it could only
 * ever be a no-op there, and its `down()` could only be `DROP TABLE` against production data.
 * Scoped to local development, anything wrong here costs a `docker compose down -v`.
 */
export async function seedPropertySalesRaw(
  dataSource: DataSource,
): Promise<void> {
  // Second lock on top of seed.ts's own NODE_ENV check. Every other seeder writes to tables this
  // repo owns; this one names a table holding 2.3M real rows in production.
  if (process.env.NODE_ENV === 'production') {
    logger.log('Skipped: refuses to run against production');
    return;
  }

  const alreadyPresent = await tableExists(dataSource);
  if (alreadyPresent) {
    // Note this cannot re-shape an existing table. Drop it first if the schema has moved.
    logger.log('Skipped (already exists): property_sales_raw');
    return;
  }

  // Postgres DDL is transactional, so the table cannot end up created without its constraints.
  await dataSource.transaction(async (manager: EntityManager) => {
    for (const statement of CREATE_STATEMENTS) {
      await manager.query(statement);
    }
  });

  logger.log('Created table: property_sales_raw (empty)');
  logger.log(
    'First PSI import will treat every published week as new — see PsiImportService.resolveReferenceLabel',
  );
}

async function tableExists(dataSource: DataSource): Promise<boolean> {
  const rows: { exists: boolean }[] = await dataSource.query(
    `SELECT to_regclass('public.property_sales_raw') IS NOT NULL AS exists`,
  );
  return rows[0]?.exists === true;
}

/**
 * Mirrors `property-sales-raw.entity.ts`, which describes the live QA/production table.
 *
 * That makes **two hand-maintained descriptions of a table neither of them owns**, and nothing
 * checks that they agree with each other or with the real thing. Both are `synchronize: false`
 * documentation, so a divergence produces no error — it just makes local quietly stop representing
 * QA, which is the exact failure that let `uq_psr_dealing_number` reach QA unnoticed. Anyone
 * changing one must change the other, and confirm against `\d property_sales_raw` on QA.
 *
 * **`uq_psr_dealing_number` is included on purpose.** It is the reason the weekly import cannot
 * store every row it parses — one land-title dealing covers several properties — and leaving it out
 * locally is exactly the drift that let that failure reach QA unnoticed. Local must fail the same
 * way QA does, or local proves nothing. `PsiImportRepository.insertSaleRecords` handles it with
 * `ON CONFLICT DO NOTHING` and counts what it discards.
 *
 * Statements are executed one at a time rather than as a single blob so a failure names itself.
 * Postgres has no `CREATE TYPE ... IF NOT EXISTS`, hence the `DO` block trapping `duplicate_object`
 * — the type survives a `DROP TABLE`, so re-seeding after one would otherwise fail.
 */
const CREATE_STATEMENTS = [
  `DO $$ BEGIN
     CREATE TYPE area_type_enum AS ENUM ('M', 'H');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,

  `CREATE TABLE IF NOT EXISTS property_sales_raw (
     id                       bigserial PRIMARY KEY,
     source_file              varchar(255) NOT NULL,
     imported_at              timestamptz  NOT NULL DEFAULT NOW(),
     district_code            varchar(10),
     property_id              varchar(50),
     sale_counter             smallint,
     download_datetime        timestamptz,
     property_name            varchar(255),
     property_unit_number     varchar(50),
     property_house_number    varchar(50),
     property_street_name     varchar(255),
     property_locality        varchar(100),
     property_post_code       char(4),
     area                     numeric(15,4),
     area_type                area_type_enum,
     contract_date            date,
     settlement_date          date,
     purchase_price           numeric(15,2),
     zoning                   varchar(20),
     nature_of_property       varchar(50),
     primary_purpose          varchar(50),
     strata_lot_number        varchar(50),
     component_code           varchar(20),
     sale_code                varchar(20),
     interest_of_sale_percent numeric(5,2),
     dealing_number           varchar(50),
     owner_type               varchar(50),
     CONSTRAINT uq_psr_dealing_number UNIQUE (dealing_number)
   )`,

  // The nine indexes the entity declares. No index on download_datetime — faithful to QA, and a
  // known gap: findLatestDownloadDatetime orders by that column on every import.
  `CREATE INDEX IF NOT EXISTS idx_psr_locality_date  ON property_sales_raw (property_locality, contract_date)`,
  `CREATE INDEX IF NOT EXISTS idx_psr_post_code      ON property_sales_raw (property_post_code)`,
  `CREATE INDEX IF NOT EXISTS idx_psr_contract_date  ON property_sales_raw (contract_date)`,
  `CREATE INDEX IF NOT EXISTS idx_psr_district_code  ON property_sales_raw (district_code)`,
  `CREATE INDEX IF NOT EXISTS idx_psr_zoning         ON property_sales_raw (zoning)`,
  `CREATE INDEX IF NOT EXISTS idx_psr_nature         ON property_sales_raw (nature_of_property)`,
  `CREATE INDEX IF NOT EXISTS idx_psr_purchase_price ON property_sales_raw (purchase_price)`,
  `CREATE INDEX IF NOT EXISTS idx_psr_source_file    ON property_sales_raw (source_file)`,
  `CREATE INDEX IF NOT EXISTS idx_psr_imported_at    ON property_sales_raw (imported_at)`,
];
