import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveAwaitingVgResponseStatus1778100000000 implements MigrationInterface {
  name = 'RemoveAwaitingVgResponseStatus1778100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE dispute_cases SET status = 'submitted_to_vg' WHERE status = 'awaiting_vg_response'`);

    await queryRunner.query(`ALTER TYPE dispute_cases_status_enum RENAME TO dispute_cases_status_enum_old`);

    await queryRunner.query(`
      CREATE TYPE dispute_cases_status_enum AS ENUM (
        'pending_tnc',
        'draft',
        'grounds_selection',
        'evidence_compilation',
        'appraisal',
        'advisory_letter_issued',
        'objection_package_prepared',
        'awaiting_client_approval',
        'client_approved',
        'submitted_to_vg',
        'vg_response_received',
        'vg_approved',
        'vg_declined',
        'for_review',
        'outcome_received',
        'closed',
        'closed_no_objection'
      )
    `);

    await queryRunner.query(`ALTER TABLE dispute_cases ALTER COLUMN status DROP DEFAULT`);
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ALTER COLUMN status TYPE dispute_cases_status_enum
        USING status::text::dispute_cases_status_enum
    `);
    await queryRunner.query(`ALTER TABLE dispute_cases ALTER COLUMN status SET DEFAULT 'draft'`);

    await queryRunner.query(`DROP TYPE dispute_cases_status_enum_old`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "dispute_cases_status_enum" ADD VALUE IF NOT EXISTS 'awaiting_vg_response'`);
  }
}
