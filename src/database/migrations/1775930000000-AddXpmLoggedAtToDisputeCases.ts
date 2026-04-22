import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddXpmLoggedAtToDisputeCases1775930000000 implements MigrationInterface {
  name = 'AddXpmLoggedAtToDisputeCases1775930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
      ADD COLUMN IF NOT EXISTS "xpm_logged_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "closure_notes" TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
      DROP COLUMN IF EXISTS "xpm_logged_at",
      DROP COLUMN IF EXISTS "closure_notes"
    `);
  }
}
