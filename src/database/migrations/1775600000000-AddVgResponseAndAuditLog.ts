import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVgResponseAndAuditLog1775600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add enum value — must be outside a transaction block
    await queryRunner.query(`
      ALTER TYPE dispute_cases_status_enum ADD VALUE IF NOT EXISTS 'vg_response_received'
    `);

    // Step 2: Add columns to dispute_cases
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN IF NOT EXISTS vg_response_received_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS lodgment_reference_number TEXT NULL
    `);

    // Step 3: Create case_audit_logs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS case_audit_logs (
        id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        case_id        UUID        NOT NULL REFERENCES dispute_cases(id) ON DELETE CASCADE,
        action         TEXT        NOT NULL,
        performed_by   UUID        NOT NULL REFERENCES users(id),
        response_notes TEXT        NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_case_audit_logs_case_id ON case_audit_logs(case_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop audit table and index first (no transaction needed for DDL drops)
    await queryRunner.query(`DROP TABLE IF EXISTS case_audit_logs`);

    // Drop new columns
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        DROP COLUMN IF EXISTS lodgment_reference_number,
        DROP COLUMN IF EXISTS vg_response_received_at
    `);

    // Remove 'vg_response_received' from the enum by full recreation
    await queryRunner.startTransaction();

    try {
      // Remap any rows using the value we are removing
      await queryRunner.query(`
        UPDATE dispute_cases
        SET status = 'awaiting_vg_response'
        WHERE status = 'vg_response_received'
      `);

      // Rename existing enum to a temporary name
      await queryRunner.query(`
        ALTER TYPE dispute_cases_status_enum RENAME TO dispute_cases_status_enum_old
      `);

      // Recreate the enum without the removed value
      await queryRunner.query(`
        CREATE TYPE dispute_cases_status_enum AS ENUM (
          'draft',
          'grounds_selection',
          'evidence_compilation',
          'appraisal',
          'advisory_letter_issued',
          'objection_package_prepared',
          'awaiting_client_approval',
          'submitted_to_vg',
          'awaiting_vg_response',
          'outcome_received',
          'closed',
          'closed_no_objection'
        )
      `);

      // Migrate the column to use the new enum type
      await queryRunner.query(`
        ALTER TABLE dispute_cases
          ALTER COLUMN status TYPE dispute_cases_status_enum
          USING status::text::dispute_cases_status_enum
      `);

      // Reset the column default
      await queryRunner.query(`
        ALTER TABLE dispute_cases
          ALTER COLUMN status SET DEFAULT 'draft'
      `);

      // Drop the old enum type
      await queryRunner.query(`DROP TYPE dispute_cases_status_enum_old`);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    }
  }
}
