import { Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

const logger = new Logger('PropertySalesRawSeeder');

/**
 * Creates `property_sales_raw` on a local development database.
 *
 * Unlike every other seeder here, this one creates a table rather than rows — because nothing else
 * in the repository does. `property_sales_raw` was loaded out of band in QA/prod, no migration
 * defines it, and `property-sales-raw.entity.ts` is deliberately `synchronize: false` so TypeORM
 * never emits a CREATE TABLE against it. The upshot is that a fresh `npm run reset` leaves a
 * database where the PSI import dies on its first query with
 * `relation "property_sales_raw" does not exist`, before Puppeteer even launches.
 *
 * Deliberately NOT a migration. `migration:run` executes against prod and QA in the deploy
 * pipeline, and the column list below is *inferred* from the entity rather than read from the real
 * table — putting it in a migration would make a guess canonical for a table this repo does not
 * own, and `down()` would have to be `DROP TABLE` against production data. Scoping it to local
 * development keeps the guess where it can only cost a `docker compose down -v`.
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
    logger.log('Skipped (already exists): property_sales_raw');
    return;
  }

  // Postgres DDL is transactional, so the table cannot end up created without its primary key.
  await dataSource.transaction(async (manager: EntityManager) => {
    await manager.query(CREATE_PROPERTY_SALES_RAW);
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
 * Mirrors `src/api/psi-import/entities/property-sales-raw.entity.ts` column for column.
 *
 * `id bigserial` is structural, not a performance choice: the insert in
 * `PsiImportRepository.insertSaleRecords` omits `id` and relies on a column default.
 *
 * No secondary indexes on purpose. This repo cannot see production's index set, and inventing some
 * here would make local queries faster than the environment they exist to represent — a worse trap
 * than a slow development query, since it silently invalidates any local timing observation.
 */
const CREATE_PROPERTY_SALES_RAW = `
  CREATE TABLE IF NOT EXISTS property_sales_raw (
    id                       bigserial PRIMARY KEY,
    source_file              varchar,
    imported_at              timestamptz,
    district_code            varchar,
    property_id              varchar,
    sale_counter             integer,
    download_datetime        timestamptz,
    property_name            varchar,
    property_unit_number     varchar,
    property_house_number    varchar,
    property_street_name     varchar,
    property_locality        varchar,
    property_post_code       varchar,
    area                     numeric(15,4),
    area_type                varchar,
    contract_date            timestamptz,
    settlement_date          timestamptz,
    purchase_price           numeric(20,2),
    zoning                   varchar,
    nature_of_property       varchar,
    primary_purpose          varchar,
    strata_lot_number        varchar,
    component_code           varchar,
    sale_code                varchar,
    interest_of_sale_percent numeric(10,4),
    dealing_number           varchar,
    owner_type               varchar
  )
`;
