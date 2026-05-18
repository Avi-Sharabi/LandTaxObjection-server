import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLandTaxComputationSchema1777500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Ownership type enum for valuation_notices
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "valuation_notice_ownership_type_enum" AS ENUM ('individual', 'company_trust');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    // 2. New columns on valuation_notices
    await queryRunner.query(`
      ALTER TABLE valuation_notices
        ADD COLUMN IF NOT EXISTS land_value_2yr_prior  NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS ownership_type        "valuation_notice_ownership_type_enum",
        ADD COLUMN IF NOT EXISTS is_foreign            BOOLEAN NOT NULL DEFAULT false
    `);

    // 3. New columns on dispute_cases
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN IF NOT EXISTS yml_fee_share_pct  NUMERIC(5, 2) NOT NULL DEFAULT 20,
        ADD COLUMN IF NOT EXISTS tax_saving         NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS yml_revenue        NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS client_savings     NUMERIC(15, 2)
    `);

    // 4. land_tax_rates lookup table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS land_tax_rates (
        id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        tax_year              SMALLINT      NOT NULL UNIQUE,
        threshold             NUMERIC(15, 2) NOT NULL,
        base_amount           NUMERIC(12, 2) NOT NULL,
        marginal_rate_pct     NUMERIC(5, 3)  NOT NULL,
        premium_threshold     NUMERIC(15, 2) NOT NULL,
        premium_base_amount   NUMERIC(12, 2) NOT NULL,
        premium_rate_pct      NUMERIC(5, 3)  NOT NULL,
        foreign_surcharge_pct NUMERIC(5, 3)  NOT NULL DEFAULT 4,
        created_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);

    // 5. Seed NSW rate bands 2024–2026
    await queryRunner.query(`
      INSERT INTO land_tax_rates
        (tax_year, threshold, base_amount, marginal_rate_pct,
         premium_threshold, premium_base_amount, premium_rate_pct, foreign_surcharge_pct)
      VALUES
        (2024, 1075000.00, 100.00, 1.600, 6571000.00, 88395.00, 2.000, 4.000),
        (2025, 1187000.00, 100.00, 1.600, 4856000.00, 61876.00, 2.000, 4.000),
        (2026, 1075000.00, 100.00, 1.600, 6571000.00, 88036.00, 2.000, 4.000)
      ON CONFLICT (tax_year) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS land_tax_rates`);

    await queryRunner.query(`
      ALTER TABLE dispute_cases
        DROP COLUMN IF EXISTS client_savings,
        DROP COLUMN IF EXISTS yml_revenue,
        DROP COLUMN IF EXISTS tax_saving,
        DROP COLUMN IF EXISTS yml_fee_share_pct
    `);

    await queryRunner.query(`
      ALTER TABLE valuation_notices
        DROP COLUMN IF EXISTS is_foreign,
        DROP COLUMN IF EXISTS ownership_type,
        DROP COLUMN IF EXISTS land_value_2yr_prior
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "valuation_notice_ownership_type_enum"
    `);
  }
}
