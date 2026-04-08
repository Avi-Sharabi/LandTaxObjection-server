import { MigrationInterface, QueryRunner } from "typeorm";

export class CleanupClientFyiFields1775022368813 implements MigrationInterface {
    name = 'CleanupClientFyiFields1775022368813'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "mobile"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "client_code"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "source_id"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "fyi_id"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "fyi_uuid"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "fyi_manager_email"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "fyi_partner_email"`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "xpm_uuid" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "xpm_uuid"`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "fyi_partner_email" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "fyi_manager_email" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "fyi_uuid" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "fyi_id" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "source_id" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "client_code" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "mobile" text`);
    }

}
