import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable1775520000000 implements MigrationInterface {
  name = 'CreateNotificationsTable1775520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id"         UUID              NOT NULL DEFAULT gen_random_uuid(),
        "user_id"    UUID              NOT NULL,
        "type"       TEXT              NOT NULL,
        "message"    TEXT              NOT NULL,
        "case_id"    UUID              NULL,
        "read"       BOOLEAN           NOT NULL DEFAULT false,
        "read_at"    TIMESTAMPTZ       NULL,
        "created_at" TIMESTAMPTZ       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_user_id_read"
        ON "notifications" ("user_id", "read")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_notifications_user_id_read"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
