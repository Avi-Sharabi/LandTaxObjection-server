import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterClientColumnTypes1782777600000 implements MigrationInterface {
  name = 'AlterClientColumnTypes1782777600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Nullify title/gender values that fall outside the allowed enum sets
    // so the subsequent ALTER TYPE USING cast does not fail on unknown values.
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

    // Enum types
    await queryRunner.query(`CREATE TYPE "clients_title_enum" AS ENUM ('Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Prof.')`);
    await queryRunner.query(`CREATE TYPE "clients_gender_enum" AS ENUM ('Male', 'Female', 'Prefer not to say')`);

    // Identity
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "name" TYPE VARCHAR(100) USING "name"::VARCHAR(100)`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "title" TYPE "clients_title_enum" USING "title"::"clients_title_enum"`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "gender" TYPE "clients_gender_enum" USING "gender"::"clients_gender_enum"`);

    // Contact
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "email" TYPE VARCHAR(255) USING "email"::VARCHAR(255)`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "phone" TYPE VARCHAR(25) USING "phone"::VARCHAR(25)`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "mobile" TYPE VARCHAR(25) USING "mobile"::VARCHAR(25)`);

    // Address
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "address" TYPE VARCHAR(255) USING "address"::VARCHAR(255)`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "city" TYPE VARCHAR(100) USING "city"::VARCHAR(100)`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "region" TYPE VARCHAR(100) USING "region"::VARCHAR(100)`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "postcode" TYPE VARCHAR(10) USING "postcode"::VARCHAR(10)`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "country" TYPE VARCHAR(100) USING "country"::VARCHAR(100)`);

    // Postal address
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "postal_address" TYPE VARCHAR(255) USING "postal_address"::VARCHAR(255)`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "postal_city" TYPE VARCHAR(100) USING "postal_city"::VARCHAR(100)`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "postal_region" TYPE VARCHAR(100) USING "postal_region"::VARCHAR(100)`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "postal_postcode" TYPE VARCHAR(10) USING "postal_postcode"::VARCHAR(10)`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "postal_country" TYPE VARCHAR(100) USING "postal_country"::VARCHAR(100)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postal address
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "postal_country" TYPE TEXT USING "postal_country"::TEXT`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "postal_postcode" TYPE TEXT USING "postal_postcode"::TEXT`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "postal_region" TYPE TEXT USING "postal_region"::TEXT`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "postal_city" TYPE TEXT USING "postal_city"::TEXT`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "postal_address" TYPE TEXT USING "postal_address"::TEXT`);

    // Address
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "country" TYPE TEXT USING "country"::TEXT`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "postcode" TYPE TEXT USING "postcode"::TEXT`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "region" TYPE TEXT USING "region"::TEXT`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "city" TYPE TEXT USING "city"::TEXT`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "address" TYPE TEXT USING "address"::TEXT`);

    // Contact
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "mobile" TYPE TEXT USING "mobile"::TEXT`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "phone" TYPE TEXT USING "phone"::TEXT`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "email" TYPE TEXT USING "email"::TEXT`);

    // Identity — drop enum columns before dropping the types
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "gender" TYPE TEXT USING "gender"::TEXT`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "title" TYPE TEXT USING "title"::TEXT`);
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "name" TYPE TEXT USING "name"::TEXT`);

    await queryRunner.query(`DROP TYPE IF EXISTS "clients_gender_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "clients_title_enum"`);
  }
}
