import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdvisoryViewTokenToDisputeCases1775800000000 implements MigrationInterface {
  name = 'AddAdvisoryViewTokenToDisputeCases1775800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
      ADD COLUMN IF NOT EXISTS "advisory_view_token" uuid,
      ADD COLUMN IF NOT EXISTS "advisory_view_token_expires_at" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
      DROP COLUMN IF EXISTS "advisory_view_token_expires_at",
      DROP COLUMN IF EXISTS "advisory_view_token"
    `);
  }
}
