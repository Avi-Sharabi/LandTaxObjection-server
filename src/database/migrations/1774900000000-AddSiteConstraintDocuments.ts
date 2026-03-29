import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSiteConstraintDocuments1774900000000 implements MigrationInterface {
  name = 'AddSiteConstraintDocuments1774900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create the new documents table
    await queryRunner.query(`
      CREATE TABLE "site_constraint_documents" (
        "id"            uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "constraint_id" uuid          NOT NULL,
        "blob_path"     text          NOT NULL,
        "uploaded_at"   TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_site_constraint_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_site_constraint_documents_constraint"
          FOREIGN KEY ("constraint_id")
          REFERENCES "site_constraints"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_site_constraint_documents_constraint_id"
        ON "site_constraint_documents" ("constraint_id")
    `);

    // 2. Migrate any existing single-document rows into the new table
    await queryRunner.query(`
      INSERT INTO "site_constraint_documents" ("constraint_id", "blob_path")
      SELECT "id", "document_blob_url"
      FROM   "site_constraints"
      WHERE  "document_blob_url" IS NOT NULL
    `);

    // 3. Drop the now-redundant column from site_constraints
    await queryRunner.query(`
      ALTER TABLE "site_constraints" DROP COLUMN IF EXISTS "document_blob_url"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the column (only the first document per constraint is recoverable)
    await queryRunner.query(`
      ALTER TABLE "site_constraints" ADD COLUMN "document_blob_url" text
    `);

    await queryRunner.query(`
      UPDATE "site_constraints" sc
      SET    "document_blob_url" = sub.blob_path
      FROM (
        SELECT DISTINCT ON ("constraint_id") "constraint_id", "blob_path"
        FROM   "site_constraint_documents"
        ORDER  BY "constraint_id", "uploaded_at" ASC
      ) sub
      WHERE sc.id = sub.constraint_id
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_site_constraint_documents_constraint_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "site_constraint_documents"`);
  }
}
