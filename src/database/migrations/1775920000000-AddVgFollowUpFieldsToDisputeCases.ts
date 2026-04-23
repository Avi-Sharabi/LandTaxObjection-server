import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVgFollowUpFieldsToDisputeCases1775920000000 implements MigrationInterface {
  name = 'AddVgFollowUpFieldsToDisputeCases1775920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN "vg_follow_up_count"      SMALLINT    NOT NULL DEFAULT 0,
        ADD COLUMN "last_vg_follow_up_sent_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        DROP COLUMN IF EXISTS "vg_follow_up_count",
        DROP COLUMN IF EXISTS "last_vg_follow_up_sent_at"
    `);
  }
}
