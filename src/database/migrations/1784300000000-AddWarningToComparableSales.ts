import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarningToComparableSales1784300000000 implements MigrationInterface {
  name = 'AddWarningToComparableSales1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "comparable_sales" ADD COLUMN "warning" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN IF EXISTS "warning"`);
  }
}
