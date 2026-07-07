import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertClientTitleGenderToText1782800000000 implements MigrationInterface {
  name = 'ConvertClientTitleGenderToText1782800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // XPM does not constrain Title/Gender to a fixed set of values, so these
    // columns must accept whatever raw string XPM sends rather than enforcing
    // a Postgres enum.
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "title" TYPE TEXT USING "title"::TEXT`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "gender" TYPE TEXT USING "gender"::TEXT`);

    await queryRunner.query(`DROP TYPE IF EXISTS "clients_title_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "clients_gender_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "clients" SET "title" = NULL
      WHERE "title" IS NOT NULL
        AND "title" NOT IN ('Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Prof.')
    `);
    await queryRunner.query(`
      UPDATE "clients" SET "gender" = NULL
      WHERE "gender" IS NOT NULL
        AND "gender" NOT IN ('Male', 'Female', 'Prefer not to say')
    `);

    await queryRunner.query(`CREATE TYPE "clients_title_enum" AS ENUM ('Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Prof.')`);
    await queryRunner.query(`CREATE TYPE "clients_gender_enum" AS ENUM ('Male', 'Female', 'Prefer not to say')`);

    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "title" TYPE "clients_title_enum" USING "title"::"clients_title_enum"`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "gender" TYPE "clients_gender_enum" USING "gender"::"clients_gender_enum"`);
  }
}
