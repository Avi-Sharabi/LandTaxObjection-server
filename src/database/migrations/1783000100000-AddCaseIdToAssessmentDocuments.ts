import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCaseIdToAssessmentDocuments1783000100000 implements MigrationInterface {
  name = 'AddCaseIdToAssessmentDocuments1783000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "assessment_documents" ADD COLUMN IF NOT EXISTS "case_id" UUID NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "assessment_documents"
        ADD CONSTRAINT "FK_assessment_documents_case_id"
        FOREIGN KEY ("case_id") REFERENCES "dispute_cases" ("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_assessment_documents_case_id"
        ON "assessment_documents" ("case_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_assessment_documents_case_id"`);
    await queryRunner.query(`ALTER TABLE "assessment_documents" DROP CONSTRAINT IF EXISTS "FK_assessment_documents_case_id"`);
    await queryRunner.query(`ALTER TABLE "assessment_documents" DROP COLUMN IF EXISTS "case_id"`);
  }
}
