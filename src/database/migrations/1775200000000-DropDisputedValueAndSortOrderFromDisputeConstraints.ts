import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropDisputedValueAndSortOrderFromDisputeConstraints1775200000000 implements MigrationInterface {
  name = 'DropDisputedValueAndSortOrderFromDisputeConstraints1775200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dispute_constraints" DROP COLUMN IF EXISTS "disputed_value"`);
    await queryRunner.query(`ALTER TABLE "dispute_constraints" DROP COLUMN IF EXISTS "sort_order"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dispute_constraints" ADD COLUMN "sort_order" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "dispute_constraints" ADD COLUMN "disputed_value" numeric(15,2)`);
  }
}
