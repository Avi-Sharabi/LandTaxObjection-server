import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentNameToAssessmentDocuments1778200000000 implements MigrationInterface {
  name = 'AddDocumentNameToAssessmentDocuments1778200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "assessment_documents" ADD COLUMN "document_name" text`);
    await queryRunner.query(`UPDATE "assessment_documents" SET "document_name" = 'Land Tax Assessment Notice' WHERE "document_name" IS NULL`);
    await queryRunner.query(`ALTER TABLE "assessment_documents" ALTER COLUMN "document_name" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "assessment_documents" DROP COLUMN "notice_date"`);
    await queryRunner.query(`ALTER TABLE "assessment_documents" DROP COLUMN "valuation_year"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "assessment_documents" ADD COLUMN "valuation_year" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "assessment_documents" ADD COLUMN "notice_date" date NOT NULL DEFAULT CURRENT_DATE`);
    await queryRunner.query(`ALTER TABLE "assessment_documents" DROP COLUMN "document_name"`);
  }
}
