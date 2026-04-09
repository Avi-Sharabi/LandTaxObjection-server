import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnalysisReportUrlToDisputeCases1775500000000 implements MigrationInterface {
  name = 'AddAnalysisReportUrlToDisputeCases1775500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
      ADD COLUMN IF NOT EXISTS "analysis_report_blob_path" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
      DROP COLUMN IF EXISTS "analysis_report_blob_path"
    `);
  }
}
