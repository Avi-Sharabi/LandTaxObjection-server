import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSiteAreaAndDeadlineFreshnessFields1783100000000 implements MigrationInterface {
  name = 'AddSiteAreaAndDeadlineFreshnessFields1783100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties" ADD COLUMN "land_area_eplanning_sqm" numeric(12,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "valuation_notices" ADD COLUMN "notice_issue_date" date
    `);
    await queryRunner.query(`
      ALTER TABLE "dispute_cases" ADD COLUMN "deadline_lapsed_flagged" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dispute_cases" DROP COLUMN IF EXISTS "deadline_lapsed_flagged"`);
    await queryRunner.query(`ALTER TABLE "valuation_notices" DROP COLUMN IF EXISTS "notice_issue_date"`);
    await queryRunner.query(`ALTER TABLE "properties" DROP COLUMN IF EXISTS "land_area_eplanning_sqm"`);
  }
}
