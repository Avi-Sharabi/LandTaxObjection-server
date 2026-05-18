import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVgResponseNotesAndStatusIndex1777950000000 implements MigrationInterface {
  name = 'AddVgResponseNotesAndStatusIndex1777950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispute_cases DROP COLUMN IF EXISTS vg_response_received_at`);
    await queryRunner.query(`ALTER TABLE dispute_cases DROP COLUMN IF EXISTS vg_email_message_id`);
    await queryRunner.query(`ALTER TABLE dispute_cases ADD COLUMN IF NOT EXISTS vg_response_notes TEXT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_dispute_cases_status ON dispute_cases (status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_dispute_cases_status`);
    await queryRunner.query(`ALTER TABLE dispute_cases DROP COLUMN IF EXISTS vg_response_notes`);
    await queryRunner.query(`ALTER TABLE dispute_cases ADD COLUMN vg_email_message_id TEXT NULL`);
    await queryRunner.query(`ALTER TABLE dispute_cases ADD COLUMN vg_response_received_at TIMESTAMPTZ NULL`);
  }
}
