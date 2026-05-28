import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogContextColumns1775920000000 implements MigrationInterface {
  name = 'AddAuditLogContextColumns1775920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
        ADD COLUMN IF NOT EXISTS "entity_type"       TEXT  NULL,
        ADD COLUMN IF NOT EXISTS "entity_id"         UUID  NULL,
        ADD COLUMN IF NOT EXISTS "description"       TEXT  NULL,
        ADD COLUMN IF NOT EXISTS "metadata"          JSONB NULL,
        ADD COLUMN IF NOT EXISTS "performed_by_name" TEXT  NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at"
        ON "audit_logs" ("created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action"
        ON "audit_logs" ("action")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_performed_by"
        ON "audit_logs" ("performed_by")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_entity"
        ON "audit_logs" ("entity_type", "entity_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_entity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_performed_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_created_at"`);

    await queryRunner.query(`
      ALTER TABLE "audit_logs"
        DROP COLUMN IF EXISTS "performed_by_name",
        DROP COLUMN IF EXISTS "metadata",
        DROP COLUMN IF EXISTS "description",
        DROP COLUMN IF EXISTS "entity_id",
        DROP COLUMN IF EXISTS "entity_type"
    `);
  }
}
