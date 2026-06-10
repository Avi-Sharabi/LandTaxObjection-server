import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoftDeleteToClientsAndCases1781049600000 implements MigrationInterface {
  name = 'AddSoftDeleteToClientsAndCases1781049600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "deleted_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "deleted_by" UUID`);
    await queryRunner.query(`ALTER TABLE "dispute_cases" ADD COLUMN "deleted_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "dispute_cases" ADD COLUMN "deleted_by" UUID`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dispute_cases" DROP COLUMN "deleted_by"`);
    await queryRunner.query(`ALTER TABLE "dispute_cases" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "deleted_by"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "deleted_at"`);
  }
}
