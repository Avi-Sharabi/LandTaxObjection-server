import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCaseAuditLog1775910000000 implements MigrationInterface {
  name = 'CreateCaseAuditLog1775910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "case_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "action" text NOT NULL,
        "case_id" uuid NOT NULL,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_case_audit_logs" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "case_audit_logs"`);
  }
}
