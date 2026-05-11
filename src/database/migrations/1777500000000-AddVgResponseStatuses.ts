import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVgResponseStatuses1777500000000 implements MigrationInterface {
  name = 'AddVgResponseStatuses1777500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE dispute_cases_status_enum ADD VALUE IF NOT EXISTS 'vg_approved'`);
    await queryRunner.query(`ALTER TYPE dispute_cases_status_enum ADD VALUE IF NOT EXISTS 'vg_declined'`);

    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN IF NOT EXISTS vg_response_received_at TIMESTAMPTZ DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dispute_cases DROP COLUMN IF EXISTS vg_response_received_at`);

    await queryRunner.query(`UPDATE dispute_cases SET status = 'awaiting_vg_response' WHERE status IN ('vg_approved', 'vg_declined')`);
    await queryRunner.query(`ALTER TYPE dispute_cases_status_enum RENAME TO dispute_cases_status_enum_old`);
    await queryRunner.query(`
      CREATE TYPE dispute_cases_status_enum AS ENUM (
        'pending_tnc', 'draft', 'grounds_selection', 'evidence_compilation', 'appraisal',
        'advisory_letter_issued', 'objection_package_prepared', 'awaiting_client_approval',
        'client_approved', 'submitted_to_vg', 'awaiting_vg_response', 'outcome_received',
        'closed', 'closed_no_objection'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ALTER COLUMN status TYPE dispute_cases_status_enum
        USING status::text::dispute_cases_status_enum
    `);
    await queryRunner.query(`ALTER TABLE dispute_cases ALTER COLUMN status SET DEFAULT 'draft'`);
    await queryRunner.query(`DROP TYPE dispute_cases_status_enum_old`);
  }
}
