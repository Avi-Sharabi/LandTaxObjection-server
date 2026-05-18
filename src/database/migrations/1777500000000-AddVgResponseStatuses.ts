import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVgResponseStatuses1777500000000 implements MigrationInterface {
  name = 'AddVgResponseStatuses1777500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum values — idempotent whether KAN-118 migrations have already run or not
    await queryRunner.query(`ALTER TYPE dispute_cases_status_enum ADD VALUE IF NOT EXISTS 'vg_approved'`);
    await queryRunner.query(`ALTER TYPE dispute_cases_status_enum ADD VALUE IF NOT EXISTS 'vg_declined'`);
    await queryRunner.query(`ALTER TYPE dispute_cases_status_enum ADD VALUE IF NOT EXISTS 'for_review'`);

    // Migrate any rows that were previously in the removed 'awaiting_vg_response' state.
    // Those cases were submitted but hadn't received a response yet, so submitted_to_vg is the
    // correct equivalent. Must run after the new enum values are committed (separate statements).
    await queryRunner.query(`
      UPDATE dispute_cases SET status = 'submitted_to_vg' WHERE status = 'awaiting_vg_response'
    `);

    // Column — idempotent; KAN-118 migration 1777950000000 also uses IF NOT EXISTS
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN IF NOT EXISTS vg_response_notes TEXT DEFAULT NULL
    `);

    // Status index — idempotent; KAN-118 migration 1777950000000 also creates this
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_dispute_cases_status ON dispute_cases (status)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_dispute_cases_status`);
    await queryRunner.query(`ALTER TABLE dispute_cases DROP COLUMN IF EXISTS vg_response_notes`);
    // Revert the data migration — cases moved from awaiting_vg_response are now submitted_to_vg;
    // we cannot distinguish them from originally-submitted_to_vg rows, so we leave them as-is.
    // PostgreSQL does not support removing enum values — leave vg_approved/vg_declined/for_review in place.
  }
}
