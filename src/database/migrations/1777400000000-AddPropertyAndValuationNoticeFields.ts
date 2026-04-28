import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPropertyAndValuationNoticeFields1777400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE properties
        ADD COLUMN IF NOT EXISTS lot_dp          TEXT,
        ADD COLUMN IF NOT EXISTS dimensions      TEXT,
        ADD COLUMN IF NOT EXISTS height_limit_m  NUMERIC(6, 2)
    `);

    await queryRunner.query(`
      ALTER TABLE valuation_notices
        ADD COLUMN IF NOT EXISTS prior_land_value  NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS land_area_vg_sqm  NUMERIC(12, 2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE valuation_notices
        DROP COLUMN IF EXISTS land_area_vg_sqm,
        DROP COLUMN IF EXISTS prior_land_value
    `);

    await queryRunner.query(`
      ALTER TABLE properties
        DROP COLUMN IF EXISTS height_limit_m,
        DROP COLUMN IF EXISTS dimensions,
        DROP COLUMN IF EXISTS lot_dp
    `);
  }
}
