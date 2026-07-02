import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMobileToClients1781200000000 implements MigrationInterface {
  name = 'AddMobileToClients1781200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "mobile" TEXT`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "mobile"`);
  }
}
