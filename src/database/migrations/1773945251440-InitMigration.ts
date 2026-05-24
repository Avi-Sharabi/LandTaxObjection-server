import { MigrationInterface, QueryRunner } from "typeorm";

export class InitMigration1773945251440 implements MigrationInterface {
    name = 'InitMigration1773945251440'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "comparable_sales" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "dispute_case_id" uuid NOT NULL, "address" text NOT NULL, "sale_date" date NOT NULL, "sale_price" numeric(15,2) NOT NULL, "estimated_improvements_value" numeric(15,2) NOT NULL, "adjusted_land_value" numeric(15,2) NOT NULL, "land_area_sqm" numeric(10,2), "notes" text, "created_by_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fbc3b275bcc208874aae3761478" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "comparable_sales" ADD CONSTRAINT "FK_1a63a0c9b8d17a8c26e35cecf31" FOREIGN KEY ("dispute_case_id") REFERENCES "dispute_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comparable_sales" ADD CONSTRAINT "FK_63d77183f9368f7a0c4b33ead35" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comparable_sales" DROP CONSTRAINT "FK_63d77183f9368f7a0c4b33ead35"`);
        await queryRunner.query(`ALTER TABLE "comparable_sales" DROP CONSTRAINT "FK_1a63a0c9b8d17a8c26e35cecf31"`);
        await queryRunner.query(`DROP TABLE "comparable_sales"`);
    }

}
