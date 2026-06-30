import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePackageDocuments1775400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "package_document_category_enum" AS ENUM (
        'notice_of_objection',
        'comparable_sales_report',
        'mass_appraisal_deviation_report',
        'site_constraints_summary',
        'supporting_uploads'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "package_document_status_enum" AS ENUM (
        'ready',
        'missing',
        'pending'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "package_documents" (
        "id"              uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "dispute_case_id" uuid                              NOT NULL,
        "name"            text                              NOT NULL,
        "category"        package_document_category_enum   NOT NULL,
        "status"          package_document_status_enum     NOT NULL DEFAULT 'pending',
        "blob_name"       text,
        "file_size_bytes" integer,
        "generated_at"    TIMESTAMPTZ,
        CONSTRAINT "PK_package_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_package_documents_dispute_case"
          FOREIGN KEY ("dispute_case_id")
          REFERENCES "dispute_cases"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_package_documents_dispute_case_id"
        ON "package_documents" ("dispute_case_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_package_documents_dispute_case_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "package_documents"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "package_document_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "package_document_category_enum"`);
  }
}
