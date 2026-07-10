import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiUpdateLogs1779235200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_update_logs" (
        "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
        "action"       TEXT        NOT NULL,
        "record_id"    UUID        NULL,
        "performed_by" TEXT        NOT NULL,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_update_logs" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_update_logs"`);
  }
}
