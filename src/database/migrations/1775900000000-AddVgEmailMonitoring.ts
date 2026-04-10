import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVgEmailMonitoring1775900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Track the Graph message ID that triggered the VG response recording.
    // Unique partial index prevents the same email from being processed twice.
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN IF NOT EXISTS vg_email_message_id TEXT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dispute_cases_vg_email_message_id
        ON dispute_cases (vg_email_message_id)
        WHERE vg_email_message_id IS NOT NULL
    `);

    // Allow system-generated audit entries that have no human performer.
    // Add a 'source' column so automated actions can be identified.
    await queryRunner.query(`
      ALTER TABLE case_audit_logs
        ALTER COLUMN performed_by DROP NOT NULL,
        ADD COLUMN IF NOT EXISTS source TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_dispute_cases_vg_email_message_id
    `);

    await queryRunner.query(`
      ALTER TABLE dispute_cases
        DROP COLUMN IF EXISTS vg_email_message_id
    `);

    await queryRunner.query(`
      ALTER TABLE case_audit_logs
        DROP COLUMN IF EXISTS source,
        ALTER COLUMN performed_by SET NOT NULL
    `);
  }
}
