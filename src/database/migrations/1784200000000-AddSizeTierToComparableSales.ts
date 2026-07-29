import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSizeTierToComparableSales1784200000000 implements MigrationInterface {
  name = 'AddSizeTierToComparableSales1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "comparable_sales" ADD COLUMN "size_tier" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN IF EXISTS "size_tier"`);
  }
}
