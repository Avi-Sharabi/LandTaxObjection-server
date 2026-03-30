import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClosedNoObjectionStatus1775300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE dispute_cases_status_enum ADD VALUE IF NOT EXISTS 'closed_no_objection'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing individual values from an enum type.
    // A full type recreation would be required; left as a no-op to prevent data loss.
    // To roll back manually: migrate data away from 'closed_no_objection', then recreate the type.
  }
}
