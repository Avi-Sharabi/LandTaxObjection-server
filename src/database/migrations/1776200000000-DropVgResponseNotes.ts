import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropVgResponseNotes1776200000000 implements MigrationInterface {
  name = 'DropVgResponseNotes1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
        DROP COLUMN IF EXISTS "vg_response_notes"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_cases"
        ADD COLUMN IF NOT EXISTS "vg_response_notes" TEXT
    `);
  }
}
