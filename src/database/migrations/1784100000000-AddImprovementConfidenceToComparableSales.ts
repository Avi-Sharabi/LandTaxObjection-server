import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImprovementConfidenceToComparableSales1784100000000 implements MigrationInterface {
  name = 'AddImprovementConfidenceToComparableSales1784100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "comparable_sales" ADD COLUMN "improvement_confidence" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN IF EXISTS "improvement_confidence"`);
  }
}
