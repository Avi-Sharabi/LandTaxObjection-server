import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPidToProperties1774050000000 implements MigrationInterface {
    name = 'AddPidToProperties1774050000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "pid" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "properties" DROP COLUMN IF EXISTS "pid"`);
    }
}
