import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoftDeleteToClientsAndCases1781049600000 implements MigrationInterface {
  name = 'AddSoftDeleteToClientsAndCases1781049600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "deleted_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "deleted_by" UUID`);
    await queryRunner.query(`ALTER TABLE "dispute_cases" ADD COLUMN "deleted_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "dispute_cases" ADD COLUMN "deleted_by" UUID`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients(deleted_at) WHERE deleted_at IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_dispute_cases_deleted_at ON dispute_cases(deleted_at) WHERE deleted_at IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_dispute_cases_deleted_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_clients_deleted_at`);
    await queryRunner.query(`ALTER TABLE "dispute_cases" DROP COLUMN "deleted_by"`);
    await queryRunner.query(`ALTER TABLE "dispute_cases" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "deleted_by"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "deleted_at"`);
  }
}
