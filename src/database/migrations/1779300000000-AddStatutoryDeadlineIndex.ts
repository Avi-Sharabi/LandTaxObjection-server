import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStatutoryDeadlineIndex1779300000000 implements MigrationInterface {
  name = 'AddStatutoryDeadlineIndex1779300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_dispute_cases_statutory_deadline ON dispute_cases (statutory_deadline)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_dispute_cases_statutory_deadline`);
  }
}
