import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetadataToAuditLogs1783000000000 implements MigrationInterface {
  name = 'AddMetadataToAuditLogs1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "metadata" JSONB NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "metadata"`);
  }
}
