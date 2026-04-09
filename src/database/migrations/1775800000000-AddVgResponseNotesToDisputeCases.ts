import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVgResponseNotesToDisputeCases1775800000000 implements MigrationInterface {
  name = 'AddVgResponseNotesToDisputeCases1775800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN IF NOT EXISTS vg_response_notes TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        DROP COLUMN IF EXISTS vg_response_notes
    `);
  }
}
