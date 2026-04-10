import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLodgmentReferenceToDisputeCases1775900000000 implements MigrationInterface {
  name = 'AddLodgmentReferenceToDisputeCases1775900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
      ADD COLUMN IF NOT EXISTS "lodgment_reference_number" TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
      DROP COLUMN IF EXISTS "lodgment_reference_number"
    `);
  }
}
