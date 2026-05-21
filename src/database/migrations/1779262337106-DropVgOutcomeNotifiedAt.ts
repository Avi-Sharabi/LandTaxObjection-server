import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropVgOutcomeNotifiedAt1779262337106 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "dispute_cases" DROP COLUMN IF EXISTS "vg_outcome_notified_at"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "dispute_cases" ADD COLUMN "vg_outcome_notified_at" TIMESTAMPTZ DEFAULT NULL`,
    );
  }
}
