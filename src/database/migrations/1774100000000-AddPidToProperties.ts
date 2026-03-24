import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPidToProperties1774100000000 implements MigrationInterface {
    name = 'AddPidToProperties1774100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "properties" ADD COLUMN "pid" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "properties" DROP COLUMN "pid"`);
    }
}
