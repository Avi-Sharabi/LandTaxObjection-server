import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogTable1775910000000 implements MigrationInterface {
  name = 'CreateAuditLogTable1775910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id"                        UUID        NOT NULL DEFAULT gen_random_uuid(),
        "action"                    TEXT        NOT NULL,
        "performed_by"              UUID        NOT NULL,
        "case_id"                   UUID        NOT NULL,
        "lodgment_reference_number" TEXT        NULL,
        "created_at"                TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_case_id"
        ON "audit_logs" ("case_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_case_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
