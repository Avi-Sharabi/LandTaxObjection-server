import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVgEmailInboxTable1776000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS vg_email_inbox (
        id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        message_id        TEXT        NOT NULL UNIQUE,
        case_id           UUID        NULL REFERENCES dispute_cases(id) ON DELETE SET NULL,
        sender_address    TEXT        NOT NULL,
        subject           TEXT        NULL,
        body_content      TEXT        NULL,
        body_content_type TEXT        NULL,
        body_preview      TEXT        NULL,
        received_at       TIMESTAMPTZ NOT NULL,
        processed_at      TIMESTAMPTZ NULL,
        ai_outcome        TEXT        NULL,
        ai_analyzed_at    TIMESTAMPTZ NULL,
        ai_raw_response   JSONB       NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_vg_email_inbox_case_id
        ON vg_email_inbox (case_id)
    `);

    // Partial index so the AI agent can cheaply query unprocessed emails
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_vg_email_inbox_pending_ai
        ON vg_email_inbox (received_at)
        WHERE ai_outcome IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS vg_email_inbox`);
  }
}
