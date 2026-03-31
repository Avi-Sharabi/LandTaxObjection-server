import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClosedNoObjectionStatus1775300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE dispute_cases_status_enum ADD VALUE IF NOT EXISTS 'closed_no_objection'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not natively support removing a single enum value.
    // We recreate the type without 'closed_no_objection', remapping any rows that use it
    // to 'closed' before the type is swapped.
    await queryRunner.query(`
      -- Remap any rows using the value we are removing
      UPDATE dispute_cases
      SET status = 'closed'
      WHERE status = 'closed_no_objection';

      -- Recreate the enum without the removed value
      ALTER TYPE dispute_cases_status_enum RENAME TO dispute_cases_status_enum_old;

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
        'closed'
      );

      ALTER TABLE dispute_cases
        ALTER COLUMN status TYPE dispute_cases_status_enum
        USING status::text::dispute_cases_status_enum;

      DROP TYPE dispute_cases_status_enum_old;
    `);
  }
}
