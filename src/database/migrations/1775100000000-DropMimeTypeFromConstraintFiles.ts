import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropMimeTypeFromConstraintFiles1775100000000 implements MigrationInterface {
  name = 'DropMimeTypeFromConstraintFiles1775100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "constraint_files" DROP COLUMN IF EXISTS "mime_type"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "constraint_files" ADD COLUMN "mime_type" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "constraint_files" ALTER COLUMN "mime_type" DROP DEFAULT`);
  }
}
