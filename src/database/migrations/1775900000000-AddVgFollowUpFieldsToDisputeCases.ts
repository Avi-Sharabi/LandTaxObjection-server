import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVgFollowUpFieldsToDisputeCases1775900000000 implements MigrationInterface {
  name = 'AddVgFollowUpFieldsToDisputeCases1775900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
        ADD COLUMN IF NOT EXISTS "vg_follow_up_count" smallint NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "last_vg_follow_up_sent_at" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
        DROP COLUMN IF EXISTS "last_vg_follow_up_sent_at",
        DROP COLUMN IF EXISTS "vg_follow_up_count"
    `);
  }
}
