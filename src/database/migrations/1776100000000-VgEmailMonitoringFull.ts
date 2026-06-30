import { MigrationInterface, QueryRunner } from 'typeorm';

// Combines:
//   1776100000000-VgEmailMonitoringFull      (original)
//   1777500000000-DropVgEmailInbox           (vg_email_inbox never persisted)
//   1777510000000-DropVgEmailMessageIdUniqueIndex (one email can update many cases)
//
// Net result:
//   - New dispute_cases_status_enum values: vg_response_received, vg_approved, vg_declined
//   - New dispute_cases columns: vg_response_received_at, vg_email_message_id
//   - New table: case_audit_logs
//   - vg_email_inbox is NOT created (email content is not persisted to DB)
//   - vg_email_message_id has NO unique index (one email can update multiple cases)
export class VgEmailMonitoringFull1776100000000 implements MigrationInterface {
  name = 'VgEmailMonitoringFull1776100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "dispute_cases_status_enum" ADD VALUE IF NOT EXISTS 'vg_response_received'`);
    await queryRunner.query(`ALTER TYPE "dispute_cases_status_enum" ADD VALUE IF NOT EXISTS 'vg_approved'`);
    await queryRunner.query(`ALTER TYPE "dispute_cases_status_enum" ADD VALUE IF NOT EXISTS 'vg_declined'`);

    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
        ADD COLUMN IF NOT EXISTS "vg_response_received_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "vg_email_message_id"     TEXT
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "case_audit_logs" (
        "id"             UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "case_id"        UUID        NOT NULL,
        "action"         TEXT        NOT NULL,
        "performed_by"   UUID,
        "source"         TEXT,
        "response_notes" TEXT,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_case_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_case_audit_logs_case_id"
          FOREIGN KEY ("case_id") REFERENCES "dispute_cases" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_case_audit_logs_performed_by"
          FOREIGN KEY ("performed_by") REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_case_audit_logs_case_id"
        ON "case_audit_logs" ("case_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_case_audit_logs_case_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "case_audit_logs"`);

    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
        DROP COLUMN IF EXISTS "vg_email_message_id",
        DROP COLUMN IF EXISTS "vg_response_received_at"
    `);

    // PostgreSQL does not support DROP VALUE from enum — leave enum values in place on rollback
  }
}
