import { MigrationInterface, QueryRunner } from "typeorm";

export class AddXpmClientFields1775013474919 implements MigrationInterface {
    name = 'AddXpmClientFields1775013474919'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clients" ADD "title" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "gender" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "first_name" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "middle_name" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "last_name" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "fax" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "website" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "date_of_birth" date`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "postal_address" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "postal_city" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "postal_region" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "postal_postcode" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "postal_country" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "tax_number" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "business_structure" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "tax_agent" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "agency_status" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "referral_source" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "xpm_account_manager_uuid" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "xpm_account_manager_name" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "xpm_job_manager_uuid" text`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "xpm_job_manager_name" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "xpm_job_manager_name"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "xpm_job_manager_uuid"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "xpm_account_manager_name"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "xpm_account_manager_uuid"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "referral_source"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "agency_status"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "tax_agent"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "business_structure"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "tax_number"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "postal_country"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "postal_postcode"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "postal_region"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "postal_city"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "postal_address"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "date_of_birth"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "website"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "fax"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "last_name"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "middle_name"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "first_name"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "gender"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "title"`);
    }

}
