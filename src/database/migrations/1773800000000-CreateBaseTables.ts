import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBaseTables1773800000000 implements MigrationInterface {
  name = 'CreateBaseTables1773800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ── Enum types ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "users_role_enum" AS ENUM ('accountant', 'admin', 'Internal Assessor');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "clients_status_enum" AS ENUM ('prospect', 'tc_negotiation', 'active', 'rejected');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "properties_state_enum" AS ENUM ('NSW', 'VIC', 'QLD', 'WA');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "dispute_cases_jurisdiction_enum" AS ENUM ('NSW', 'VIC', 'QLD', 'WA');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "dispute_cases_status_enum" AS ENUM (
          'draft', 'grounds_selection', 'evidence_compilation', 'appraisal',
          'advisory_letter_issued', 'objection_package_prepared',
          'awaiting_client_approval', 'submitted_to_vg',
          'awaiting_vg_response', 'outcome_received', 'closed'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "dispute_cases_outcome_enum" AS ENUM (
          'upheld', 'partially_upheld', 'rejected', 'withdrawn'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "dispute_legal_grounds_ground_enum" AS ENUM (
          'incorrect_land_value', 'constraint_oversight',
          'incorrect_area_or_dimensions', 'incorrect_apportionment', 'not_sure'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    // ── users ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"         uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "email"      text        NOT NULL,
        "full_name"  text        NOT NULL,
        "role"       "users_role_enum" NOT NULL DEFAULT 'accountant',
        "phone"      text,
        "password"   text,
        "is_active"  boolean     NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    // ── clients ───────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "clients" (
        "id"                    uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "status"                "clients_status_enum" NOT NULL DEFAULT 'prospect',
        "name"                  text        NOT NULL,
        "email"                 text,
        "phone"                 text,
        "mobile"                text,
        "address"               text,
        "city"                  text,
        "region"                text,
        "postcode"              text,
        "country"               text,
        "business_number"       text,
        "company_number"        text,
        "client_code"           text,
        "source"                text,
        "source_id"             text,
        "fyi_id"                text,
        "fyi_uuid"              text,
        "fyi_manager_email"     text,
        "fyi_partner_email"     text,
        "assigned_accountant_id" uuid,
        "tc_accepted_at"        TIMESTAMP WITH TIME ZONE,
        "created_at"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_clients" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "clients"
        ADD CONSTRAINT "FK_clients_assigned_accountant"
        FOREIGN KEY ("assigned_accountant_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // ── properties ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "properties" (
        "id"            uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "client_id"     uuid        NOT NULL,
        "address"       text        NOT NULL,
        "suburb"        text        NOT NULL,
        "state"         "properties_state_enum" NOT NULL,
        "postcode"      text        NOT NULL,
        "ownership_pct" NUMERIC(5,2),
        "land_area_sqm" NUMERIC(12,2),
        "zoning"        text,
        "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_properties" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "properties"
        ADD CONSTRAINT "FK_properties_client"
        FOREIGN KEY ("client_id") REFERENCES "clients"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // ── valuation_notices (base columns only; migrations 2 & 3 add more) ─────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "valuation_notices" (
        "id"                   uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "property_id"          uuid        NOT NULL,
        "valuation_date"       date        NOT NULL,
        "assessed_land_value"  NUMERIC(15,2) NOT NULL,
        "benchmark_uplift_pct" NUMERIC(6,3),
        "notice_reference"     text,
        "created_at"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_valuation_notices" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "valuation_notices"
        ADD CONSTRAINT "FK_valuation_notices_property"
        FOREIGN KEY ("property_id") REFERENCES "properties"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // ── dispute_cases ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dispute_cases" (
        "id"                         uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "case_reference"             text        NOT NULL,
        "client_id"                  uuid        NOT NULL,
        "property_id"                uuid        NOT NULL,
        "valuation_notice_id"        uuid        NOT NULL,
        "assigned_accountant_id"     uuid,
        "assigned_lawyer_id"         uuid,
        "jurisdiction"               "dispute_cases_jurisdiction_enum" NOT NULL,
        "status"                     "dispute_cases_status_enum" NOT NULL DEFAULT 'draft',
        "statutory_deadline"         date        NOT NULL,
        "no_legal_ground_flagged"    boolean     NOT NULL DEFAULT false,
        "client_approval_requested_at" TIMESTAMP WITH TIME ZONE,
        "client_approved_at"         TIMESTAMP WITH TIME ZONE,
        "flag_heritage"              boolean     NOT NULL DEFAULT false,
        "flag_easement"              boolean     NOT NULL DEFAULT false,
        "flag_flood_zone"            boolean     NOT NULL DEFAULT false,
        "flag_environmental"         boolean     NOT NULL DEFAULT false,
        "flag_zoning"                boolean     NOT NULL DEFAULT false,
        "evidence_strength_score"    smallint,
        "outcome"                    "dispute_cases_outcome_enum",
        "invoice_amount"             NUMERIC(15,2),
        "original_assessed_value"    NUMERIC(15,2),
        "final_agreed_value"         NUMERIC(15,2),
        "tax_saving_achieved"        NUMERIC(15,2),
        "notes"                      text,
        "submitted_at"               TIMESTAMP WITH TIME ZONE,
        "closed_at"                  TIMESTAMP WITH TIME ZONE,
        "created_at"                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dispute_cases" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_dispute_cases_case_reference" UNIQUE ("case_reference")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
        ADD CONSTRAINT "FK_dispute_cases_client"
        FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
        ADD CONSTRAINT "FK_dispute_cases_property"
        FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
        ADD CONSTRAINT "FK_dispute_cases_valuation_notice"
        FOREIGN KEY ("valuation_notice_id") REFERENCES "valuation_notices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
        ADD CONSTRAINT "FK_dispute_cases_accountant"
        FOREIGN KEY ("assigned_accountant_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
        ADD CONSTRAINT "FK_dispute_cases_lawyer"
        FOREIGN KEY ("assigned_lawyer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // ── dispute_legal_grounds ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dispute_legal_grounds" (
        "id"         uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "dispute_id" uuid        NOT NULL,
        "ground"     "dispute_legal_grounds_ground_enum" NOT NULL,
        "notes"      text,
        "validated"  boolean     NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dispute_legal_grounds" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_dispute_legal_grounds_dispute_ground" UNIQUE ("dispute_id", "ground")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "dispute_legal_grounds"
        ADD CONSTRAINT "FK_dispute_legal_grounds_dispute"
        FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "dispute_legal_grounds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dispute_cases"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "valuation_notices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "properties"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "clients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "dispute_legal_grounds_ground_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "dispute_cases_outcome_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "dispute_cases_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "dispute_cases_jurisdiction_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "properties_state_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "clients_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
