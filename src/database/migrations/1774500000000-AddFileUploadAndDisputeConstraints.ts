import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFileUploadAndDisputeConstraints1774500000000 implements MigrationInterface {
  name = 'AddFileUploadAndDisputeConstraints1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Extend site_constraints_constraint_type_enum with folder-category values ──
    await queryRunner.query(`ALTER TYPE "public"."site_constraints_constraint_type_enum" ADD VALUE IF NOT EXISTS 'comparable_sales'`);
    await queryRunner.query(`ALTER TYPE "public"."site_constraints_constraint_type_enum" ADD VALUE IF NOT EXISTS 'market_value'`);
    await queryRunner.query(`ALTER TYPE "public"."site_constraints_constraint_type_enum" ADD VALUE IF NOT EXISTS 'land_use'`);

    // ── 2. Create shared enum types for file upload tracking ──────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."upload_status_enum" AS ENUM (
          'pending', 'scanning', 'complete', 'failed', 'rejected'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."uploaded_by_role_enum" AS ENUM (
          'client', 'staff', 'staff_on_behalf_of_client'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    // ── 3. Create valuation_notice_files ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "valuation_notice_files" (
        "id"                  uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "valuation_notice_id" uuid        NOT NULL,
        "blob_path"           text        NOT NULL,
        "original_name"       text        NOT NULL,
        "mime_type"           text        NOT NULL,
        "file_size_bytes"     integer     NOT NULL,
        "upload_status"       "public"."upload_status_enum" NOT NULL DEFAULT 'pending',
        "uploaded_by"         uuid        NOT NULL,
        "uploaded_by_role"    "public"."uploaded_by_role_enum" NOT NULL,
        "confirmed_by"        uuid,
        "confirmed_at"        TIMESTAMP WITH TIME ZONE,
        "uploaded_at"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_valuation_notice_files" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "valuation_notice_files"
        ADD CONSTRAINT "FK_valuation_notice_files_notice"
        FOREIGN KEY ("valuation_notice_id") REFERENCES "valuation_notices"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "valuation_notice_files"
        ADD CONSTRAINT "FK_valuation_notice_files_uploader"
        FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "valuation_notice_files"
        ADD CONSTRAINT "FK_valuation_notice_files_confirmer"
        FOREIGN KEY ("confirmed_by") REFERENCES "users"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // ── 4. Create dispute_constraints_constraint_type_enum ───────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."dispute_constraints_constraint_type_enum" AS ENUM (
          'heritage_listing',
          'flood_zone_100yr',
          'bushfire_bal_restriction',
          'easement_or_right_of_way',
          'environmental_conservation_overlay',
          'zoning_planning_restriction',
          'access_restriction_landlocked',
          'contamination_remediation',
          'comparable_sales',
          'market_value',
          'land_use',
          'other'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    // ── 5. Create dispute_constraints ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dispute_constraints" (
        "id"              uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "dispute_id"      uuid        NOT NULL,
        "constraint_type" "public"."dispute_constraints_constraint_type_enum" NOT NULL,
        "description"     text,
        "disputed_value"  NUMERIC(15,2),
        "sort_order"      integer     NOT NULL DEFAULT 0,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dispute_constraints" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "dispute_constraints"
        ADD CONSTRAINT "FK_dispute_constraints_dispute"
        FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // ── 6. Create constraint_files enum types ─────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."constraint_files_document_category_enum" AS ENUM (
          'heritage_listing',
          'flood_zone_100yr',
          'bushfire_bal_restriction',
          'easement_or_right_of_way',
          'environmental_conservation_overlay',
          'zoning_planning_restriction',
          'access_restriction_landlocked',
          'contamination_remediation',
          'comparable_sales',
          'market_value',
          'land_use',
          'other'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    // ── 7. Create constraint_files ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "constraint_files" (
        "id"                    uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "dispute_constraint_id" uuid        NOT NULL,
        "document_category"     "public"."constraint_files_document_category_enum" NOT NULL,
        "blob_path"             text        NOT NULL,
        "original_name"         text        NOT NULL,
        "mime_type"             text        NOT NULL,
        "file_size_bytes"       integer     NOT NULL,
        "upload_status"         "public"."upload_status_enum" NOT NULL DEFAULT 'pending',
        "uploaded_by"           uuid        NOT NULL,
        "uploaded_by_role"      "public"."uploaded_by_role_enum" NOT NULL,
        "confirmed_by"          uuid,
        "confirmed_at"          TIMESTAMP WITH TIME ZONE,
        "uploaded_at"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_constraint_files" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "constraint_files"
        ADD CONSTRAINT "FK_constraint_files_dispute_constraint"
        FOREIGN KEY ("dispute_constraint_id") REFERENCES "dispute_constraints"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "constraint_files"
        ADD CONSTRAINT "FK_constraint_files_uploader"
        FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "constraint_files"
        ADD CONSTRAINT "FK_constraint_files_confirmer"
        FOREIGN KEY ("confirmed_by") REFERENCES "users"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // ── 8. Indexes ────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX "IDX_valuation_notice_files_notice"  ON "valuation_notice_files" ("valuation_notice_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_valuation_notice_files_status"  ON "valuation_notice_files" ("upload_status")`);
    await queryRunner.query(`CREATE INDEX "IDX_dispute_constraints_dispute"    ON "dispute_constraints" ("dispute_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_constraint_files_constraint"    ON "constraint_files" ("dispute_constraint_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_constraint_files_status"        ON "constraint_files" ("upload_status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── Drop indexes ──────────────────────────────────────────────────────────
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_constraint_files_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_constraint_files_constraint"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_dispute_constraints_dispute"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_valuation_notice_files_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_valuation_notice_files_notice"`);

    // ── Drop constraint_files ─────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "constraint_files" DROP CONSTRAINT "FK_constraint_files_confirmer"`);
    await queryRunner.query(`ALTER TABLE "constraint_files" DROP CONSTRAINT "FK_constraint_files_uploader"`);
    await queryRunner.query(`ALTER TABLE "constraint_files" DROP CONSTRAINT "FK_constraint_files_dispute_constraint"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "constraint_files"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."constraint_files_document_category_enum"`);

    // ── Drop dispute_constraints ──────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "dispute_constraints" DROP CONSTRAINT "FK_dispute_constraints_dispute"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dispute_constraints"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."dispute_constraints_constraint_type_enum"`);

    // ── Drop valuation_notice_files ───────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "valuation_notice_files" DROP CONSTRAINT "FK_valuation_notice_files_confirmer"`);
    await queryRunner.query(`ALTER TABLE "valuation_notice_files" DROP CONSTRAINT "FK_valuation_notice_files_uploader"`);
    await queryRunner.query(`ALTER TABLE "valuation_notice_files" DROP CONSTRAINT "FK_valuation_notice_files_notice"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "valuation_notice_files"`);

    // ── Drop shared upload enums ──────────────────────────────────────────────
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."uploaded_by_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."upload_status_enum"`);

    // ── Roll back site_constraints_constraint_type_enum to original 9 values ─
    // PostgreSQL cannot remove enum values; we recreate the type without them.
    await queryRunner.query(`ALTER TYPE "public"."site_constraints_constraint_type_enum" RENAME TO "site_constraints_constraint_type_enum_old"`);
    await queryRunner.query(`
      CREATE TYPE "public"."site_constraints_constraint_type_enum" AS ENUM (
        'heritage_listing',
        'flood_zone_100yr',
        'bushfire_bal_restriction',
        'easement_or_right_of_way',
        'environmental_conservation_overlay',
        'zoning_planning_restriction',
        'access_restriction_landlocked',
        'contamination_remediation',
        'other'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "site_constraints"
        ALTER COLUMN "constraint_type" TYPE "public"."site_constraints_constraint_type_enum"
        USING "constraint_type"::text::"public"."site_constraints_constraint_type_enum"
    `);
    await queryRunner.query(`DROP TYPE "public"."site_constraints_constraint_type_enum_old"`);
  }
}
