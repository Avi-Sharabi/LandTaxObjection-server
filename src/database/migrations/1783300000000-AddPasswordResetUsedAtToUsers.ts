import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResetUsedAtToUsers1783300000000 implements MigrationInterface {
    name = 'AddPasswordResetUsedAtToUsers1783300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_used_at" timestamptz`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "password_reset_used_at"`);
    }
}
