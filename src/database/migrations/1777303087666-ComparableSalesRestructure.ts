import { MigrationInterface, QueryRunner } from 'typeorm';

export class ComparableSalesRestructure1777303087666 implements MigrationInterface {
  name = 'ComparableSalesRestructure1777303087666';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "address"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "sale_date"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "sale_price"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "estimated_improvements_value"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "adjusted_land_value"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "land_area_sqm"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "notes"`);

    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "sale_id" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "source_file" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "imported_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "district_code" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "property_id" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "sale_counter" integer`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "download_datetime" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "property_name" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "property_unit_number" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "property_house_number" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "property_street_name" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "property_locality" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "property_post_code" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "area" numeric(15,4)`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "contract_date" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "settlement_date" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "purchase_price" numeric(20,2)`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "zoning" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "nature_of_property" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "primary_purpose" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "strata_lot_number" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "component_code" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "sale_code" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "interest_of_sale_percent" numeric(10,4)`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "dealing_number" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "owner_type" character varying`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "adjusted_rate_per_sqm" numeric(15,2)`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "explanation" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "explanation"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "adjusted_rate_per_sqm"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "owner_type"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "dealing_number"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "interest_of_sale_percent"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "sale_code"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "component_code"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "strata_lot_number"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "primary_purpose"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "nature_of_property"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "zoning"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "purchase_price"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "settlement_date"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "contract_date"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "area"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "property_post_code"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "property_locality"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "property_street_name"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "property_house_number"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "property_unit_number"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "property_name"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "download_datetime"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "sale_counter"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "property_id"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "district_code"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "imported_at"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "source_file"`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" DROP COLUMN "sale_id"`);

    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "notes" text`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "land_area_sqm" numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "adjusted_land_value" numeric(15,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "estimated_improvements_value" numeric(15,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "sale_price" numeric(15,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "sale_date" date NOT NULL DEFAULT now()`);
    await queryRunner.query(`ALTER TABLE "comparable_sales" ADD "address" text NOT NULL DEFAULT ''`);
  }
}
