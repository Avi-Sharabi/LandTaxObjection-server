import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClosedNoObjectionStatus1775600000000 implements MigrationInterface {
  name = 'AddClosedNoObjectionStatus1775600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "dispute_cases_status_enum" ADD VALUE IF NOT EXISTS 'closed_no_objection'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values — no-op
  }
}
