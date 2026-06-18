import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResetToUsers1750000000000 implements MigrationInterface {
    name = 'AddPasswordResetToUsers1750000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_token" text`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_expires" timestamptz`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "password_reset_expires"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "password_reset_token"`);
    }
}
