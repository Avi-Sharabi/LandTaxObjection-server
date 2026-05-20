import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVgOutcomeNotifiedAt1779262337105 implements MigrationInterface {
    name = 'AddVgOutcomeNotifiedAt1779262337105';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "dispute_cases" ADD "vg_outcome_notified_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "dispute_cases" DROP COLUMN "vg_outcome_notified_at"`,
        );
    }
}
