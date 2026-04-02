import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnalysisReportUrlToDisputeCases1775500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN analysis_report_url TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        DROP COLUMN analysis_report_url
    `);
  }
}
