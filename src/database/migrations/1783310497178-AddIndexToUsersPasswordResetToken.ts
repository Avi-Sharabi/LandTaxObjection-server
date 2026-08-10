import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexToUsersPasswordResetToken1783310497178 implements MigrationInterface {
    name = 'AddIndexToUsersPasswordResetToken1783310497178';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_password_reset_token" ON "users" ("password_reset_token")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_password_reset_token"`);
    }
}
