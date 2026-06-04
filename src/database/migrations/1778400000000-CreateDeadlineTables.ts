import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeadlineTables1778400000000 implements MigrationInterface {
  name = 'CreateDeadlineTables1778400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create enum types (idempotent)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "deadline_entity_type_enum" AS ENUM (
          'dispute_case'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "deadline_type_enum" AS ENUM (
          'statutory_objection'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "deadline_status_enum" AS ENUM (
          'upcoming', 'due_soon', 'at_risk', 'overdue', 'completed', 'cancelled'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "deadline_priority_enum" AS ENUM (
          'low', 'medium', 'high', 'critical'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "deadline_activity_action_enum" AS ENUM (
          'created', 'updated', 'status_changed',
          'cancelled', 'completed', 'breached', 'notification_sent'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    // 2. deadlines table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "deadlines" (
        "id"                  UUID                          NOT NULL DEFAULT gen_random_uuid(),
        "entity_id"           UUID                          NOT NULL,
        "entity_type"         "deadline_entity_type_enum"   NOT NULL,
        "deadline_type"       "deadline_type_enum"          NOT NULL,
        "title"               TEXT                          NOT NULL,
        "status"              "deadline_status_enum"        NOT NULL DEFAULT 'upcoming',
        "due_date"            TIMESTAMPTZ                   NOT NULL,
        "assigned_owner_id"   UUID                          NOT NULL,
        "priority"            "deadline_priority_enum"      NOT NULL DEFAULT 'medium',
        "notes"               TEXT,
        "cancelled_at"        TIMESTAMPTZ,
        "cancellation_reason" TEXT,
        "completed_at"        TIMESTAMPTZ,
        "created_by_id"       UUID                          NOT NULL,
        "updated_by_id"       UUID,
        "created_at"          TIMESTAMPTZ                   NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ                   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deadlines" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "deadlines"
        ADD CONSTRAINT "FK_deadlines_assigned_owner"
        FOREIGN KEY ("assigned_owner_id") REFERENCES "users"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`CREATE INDEX "IDX_deadlines_status" ON "deadlines" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_deadlines_entity_id_entity_type" ON "deadlines" ("entity_id", "entity_type")`);
    await queryRunner.query(`CREATE INDEX "IDX_deadlines_due_date" ON "deadlines" ("due_date")`);
    await queryRunner.query(`CREATE INDEX "IDX_deadlines_assigned_owner_id" ON "deadlines" ("assigned_owner_id")`);

    // 3. deadline_activity_logs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "deadline_activity_logs" (
        "id"           UUID                              NOT NULL DEFAULT gen_random_uuid(),
        "deadline_id"  UUID                              NOT NULL,
        "action"       "deadline_activity_action_enum"   NOT NULL,
        "performed_by" UUID                              NOT NULL,
        "description"  TEXT                              NOT NULL,
        "metadata"     JSONB,
        "created_at"   TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deadline_activity_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "deadline_activity_logs"
        ADD CONSTRAINT "FK_deadline_activity_logs_deadline"
        FOREIGN KEY ("deadline_id") REFERENCES "deadlines"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`CREATE INDEX "IDX_deadline_activity_logs_deadline_id" ON "deadline_activity_logs" ("deadline_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_deadline_activity_logs_created_at" ON "deadline_activity_logs" ("created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "deadline_activity_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deadlines"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deadline_activity_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deadline_priority_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deadline_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deadline_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deadline_entity_type_enum"`);
  }
}
