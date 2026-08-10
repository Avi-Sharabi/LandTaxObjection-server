import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisputeCaseIdToAssessmentDocuments1783300000000 implements MigrationInterface {
  name = 'AddDisputeCaseIdToAssessmentDocuments1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "assessment_documents" ADD COLUMN "dispute_case_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "assessment_documents"
        ADD CONSTRAINT "FK_assessment_documents_dispute_case"
        FOREIGN KEY ("dispute_case_id") REFERENCES "dispute_cases"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_assessment_documents_dispute_case_id" ON "assessment_documents" ("dispute_case_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_assessment_documents_dispute_case_id"`);
    await queryRunner.query(`ALTER TABLE "assessment_documents" DROP CONSTRAINT "FK_assessment_documents_dispute_case"`);
    await queryRunner.query(`ALTER TABLE "assessment_documents" DROP COLUMN "dispute_case_id"`);
  }
}
