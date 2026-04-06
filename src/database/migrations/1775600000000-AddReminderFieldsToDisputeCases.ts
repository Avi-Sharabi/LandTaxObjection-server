import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReminderFieldsToDisputeCases1775600000000 implements MigrationInterface {
  name = 'AddReminderFieldsToDisputeCases1775600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN "last_reminder_sent_at" TIMESTAMPTZ,
        ADD COLUMN "reminder_count"        SMALLINT NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        DROP COLUMN IF EXISTS "last_reminder_sent_at",
        DROP COLUMN IF EXISTS "reminder_count"
    `);
  }
}
