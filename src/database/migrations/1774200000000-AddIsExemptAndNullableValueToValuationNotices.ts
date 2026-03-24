import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsExemptAndNullableValueToValuationNotices1774200000000 implements MigrationInterface {
    name = 'AddIsExemptAndNullableValueToValuationNotices1774200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "valuation_notices" ALTER COLUMN "assessed_land_value" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "valuation_notices" ADD COLUMN "is_exempt" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "valuation_notices" DROP COLUMN "is_exempt"`);
        await queryRunner.query(`ALTER TABLE "valuation_notices" ALTER COLUMN "assessed_land_value" SET NOT NULL`);
    }
}
