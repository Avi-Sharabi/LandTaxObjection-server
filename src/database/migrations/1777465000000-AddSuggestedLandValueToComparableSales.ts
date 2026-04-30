import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuggestedLandValueToComparableSales1777465000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE comparable_sales
        ADD COLUMN IF NOT EXISTS adjusted_land_value  NUMERIC(20, 2),
        ADD COLUMN IF NOT EXISTS suggested_land_value NUMERIC(20, 2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE comparable_sales
        DROP COLUMN IF EXISTS suggested_land_value,
        DROP COLUMN IF EXISTS adjusted_land_value
    `);
  }
}
