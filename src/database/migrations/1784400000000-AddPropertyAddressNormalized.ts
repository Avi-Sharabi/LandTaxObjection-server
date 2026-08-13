import { MigrationInterface, QueryRunner } from 'typeorm';

// Must stay identical to `Property.address_normalized`'s asExpression and to
// normalizePropertyAddress() in src/common/utils/address-parser.util.ts. TypeORM compares the entity's
// asExpression against the row it reads back out of typeorm_metadata, so any drift here reappears as
// a phantom ALTER in the next generated migration.
const ADDRESS_NORMALIZED_EXPRESSION = `regexp_replace(btrim(regexp_replace(upper(address), '[^A-Z0-9]+', ' ', 'g')), '( |^)(NSW|VIC|QLD|WA|SA|TAS|ACT|NT) [0-9]{4}$', '')`;

export class AddPropertyAddressNormalized1784400000000 implements MigrationInterface {
  name = 'AddPropertyAddressNormalized1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Comparison key for "does this client already have this property?". A STORED generated column
    // rather than an app-maintained one because `address` is editable via PATCH /properties/:id —
    // the database keeps this correct for every write path (including all the seeders), and existing
    // rows populate on ALTER.
    await queryRunner.query(`
      ALTER TABLE "properties"
        ADD COLUMN IF NOT EXISTS "address_normalized" text
        GENERATED ALWAYS AS (${ADDRESS_NORMALIZED_EXPRESSION}) STORED
    `);

    // TypeORM does not read generated-column expressions back from Postgres. Its schema reader sees
    // is_generated = 'ALWAYS' on this column and then unconditionally SELECTs the expression out of
    // "typeorm_metadata" — so if that table and row are missing, `migration:generate` and
    // `schema:log` both hard-fail with `relation "typeorm_metadata" does not exist`, for every
    // table, not just this one. Creating the table and registering the row here is exactly what
    // TypeORM's own generated migrations do for a generated column.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "typeorm_metadata" (
        "type"     varchar NOT NULL,
        "database" varchar,
        "schema"   varchar,
        "table"    varchar,
        "name"     varchar,
        "value"    text
      )
    `);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "schema" = $3 AND "table" = $4`,
      ['GENERATED_COLUMN', 'address_normalized', 'public', 'properties'],
    );
    // `database` is populated with current_database() rather than left DEFAULT/NULL: TypeORM looks
    // this row up with `WHERE ... AND "database" = $n` using the connection's database name, so a
    // NULL here never matches and it decides the column has no expression — emitting a phantom
    // DROP + re-ADD of the column on every generate. current_database() keeps that correct across
    // dev/QA/prod, which all use different database names.
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value")
       VALUES (current_database(), $1, $2, $3, $4, $5)`,
      [
        'public',
        'properties',
        'GENERATED_COLUMN',
        'address_normalized',
        ADDRESS_NORMALIZED_EXPRESSION,
      ],
    );

    // Column order matches the intake lookup, so the follow-up ticket can drop this and create a
    // UNIQUE index on the identical key without changing any query plan. `properties` had no
    // indexes at all before this, so the client_id lookups were seq scans.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_properties_client_state_address_normalized"
        ON "properties" ("client_id", "state", "address_normalized")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_properties_client_pid"
        ON "properties" ("client_id", "pid") WHERE "pid" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_properties_client_pid"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_properties_client_state_address_normalized"`,
    );
    // Leave the typeorm_metadata table itself in place — other generated columns may register rows
    // in it later, and TypeORM creates it on demand anyway. Only this column's row is ours to remove.
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "schema" = $3 AND "table" = $4`,
      ['GENERATED_COLUMN', 'address_normalized', 'public', 'properties'],
    );
    await queryRunner.query(
      `ALTER TABLE "properties" DROP COLUMN IF EXISTS "address_normalized"`,
    );
  }
}
