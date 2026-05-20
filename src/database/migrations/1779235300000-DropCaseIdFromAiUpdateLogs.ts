import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropCaseIdFromAiUpdateLogs1779235300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove legacy columns that existed in earlier versions of ai_update_logs
    await queryRunner.query(`ALTER TABLE "ai_update_logs" DROP COLUMN IF EXISTS "case_id"`);
    await queryRunner.query(`ALTER TABLE "ai_update_logs" DROP COLUMN IF EXISTS "lodgment_reference_number"`);

    // Add record_id — nullable UUID pointing to the record the AI updated
    await queryRunner.query(`
      ALTER TABLE "ai_update_logs"
      ADD COLUMN IF NOT EXISTS "record_id" UUID NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_update_logs" DROP COLUMN IF EXISTS "record_id"`);
  }
}
