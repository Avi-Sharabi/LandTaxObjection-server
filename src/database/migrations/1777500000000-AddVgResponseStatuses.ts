import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVgResponseStatuses1777500000000 implements MigrationInterface {
  name = 'AddVgResponseStatuses1777500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum values — idempotent whether KAN-118 migrations have already run or not
    await queryRunner.query(`ALTER TYPE dispute_cases_status_enum ADD VALUE IF NOT EXISTS 'vg_approved'`);
    await queryRunner.query(`ALTER TYPE dispute_cases_status_enum ADD VALUE IF NOT EXISTS 'vg_declined'`);
    await queryRunner.query(`ALTER TYPE dispute_cases_status_enum ADD VALUE IF NOT EXISTS 'for_review'`);

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
    // PostgreSQL does not support removing enum values — leave vg_approved/vg_declined/for_review in place
  }
}
