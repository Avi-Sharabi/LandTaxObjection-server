import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameAuditLogsToAiUpdateLogs1779235200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_update_logs" (
        "id"           UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "action"       TEXT        NOT NULL,
        "performed_by" UUID        NOT NULL,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_update_logs" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_update_logs"`);
  }
}
