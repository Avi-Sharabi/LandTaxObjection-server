import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientApprovedStatus1775700000000 implements MigrationInterface {
  name = 'AddClientApprovedStatus1775700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE dispute_cases_status_enum ADD VALUE IF NOT EXISTS 'client_approved'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(`
        UPDATE dispute_cases SET status = 'awaiting_client_approval' WHERE status = 'client_approved'
      `);
      await queryRunner.query(`
        ALTER TYPE dispute_cases_status_enum RENAME TO dispute_cases_status_enum_old
      `);
      await queryRunner.query(`
        CREATE TYPE dispute_cases_status_enum AS ENUM (
          'draft', 'grounds_selection', 'evidence_compilation', 'appraisal',
          'advisory_letter_issued', 'objection_package_prepared', 'awaiting_client_approval',
          'submitted_to_vg', 'awaiting_vg_response', 'outcome_received', 'closed', 'closed_no_objection'
        )
      `);
      await queryRunner.query(`
        ALTER TABLE dispute_cases
          ALTER COLUMN status TYPE dispute_cases_status_enum
          USING status::text::dispute_cases_status_enum
      `);
      await queryRunner.query(`ALTER TABLE dispute_cases ALTER COLUMN status SET DEFAULT 'draft'`);
      await queryRunner.query(`DROP TYPE dispute_cases_status_enum_old`);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    }
  }
}