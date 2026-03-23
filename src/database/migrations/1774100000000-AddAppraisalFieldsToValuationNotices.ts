import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppraisalFieldsToValuationNotices1774100000000 implements MigrationInterface {
  name = 'AddAppraisalFieldsToValuationNotices1774100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "valuation_notices_decision_outcome_enum" AS ENUM ('OBJECTION', 'ADVISORY');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "valuation_notices"
        ADD COLUMN IF NOT EXISTS "appraised_value"    NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS "valuation_delta"    NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS "decision_outcome"   "valuation_notices_decision_outcome_enum",
        ADD COLUMN IF NOT EXISTS "analyst_notes"      TEXT,
        ADD COLUMN IF NOT EXISTS "appraised_by_id"    UUID,
        ADD COLUMN IF NOT EXISTS "appraised_at"       TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      ALTER TABLE "valuation_notices"
        ADD CONSTRAINT "FK_valuation_notices_appraised_by"
        FOREIGN KEY ("appraised_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "valuation_notices"
        DROP CONSTRAINT IF EXISTS "FK_valuation_notices_appraised_by"
    `);

    await queryRunner.query(`
      ALTER TABLE "valuation_notices"
        DROP COLUMN IF EXISTS "appraised_value",
        DROP COLUMN IF EXISTS "valuation_delta",
        DROP COLUMN IF EXISTS "decision_outcome",
        DROP COLUMN IF EXISTS "analyst_notes",
        DROP COLUMN IF EXISTS "appraised_by_id",
        DROP COLUMN IF EXISTS "appraised_at"
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS "valuation_notices_decision_outcome_enum"`);
  }
}
