import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdvisoryLetterUrlToDisputeCases1775400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN advisory_letter_url TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        DROP COLUMN advisory_letter_url
    `);
  }
}
