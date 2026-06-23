import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsValuatedToDisputeCases1779800000000 implements MigrationInterface {
  name = 'AddIsValuatedToDisputeCases1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN "is_valuated" BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases DROP COLUMN IF EXISTS "is_valuated"
    `);
  }
}
