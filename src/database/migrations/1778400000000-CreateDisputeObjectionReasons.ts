import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDisputeObjectionReasons1778400000000 implements MigrationInterface {
  name = 'CreateDisputeObjectionReasons1778400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "dispute_objection_reasons" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "dispute_case_id" uuid NOT NULL,
        "ground_number" integer NOT NULL,
        "label" text NOT NULL,
        "is_tick" boolean NOT NULL DEFAULT false,
        "concession_type" text,
        "concession_type_note" text,
        "analysis" text,
        "evidence_files" jsonb,
        "run_id" bigint NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dispute_objection_reasons" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "dispute_objection_reasons"
        ADD CONSTRAINT "FK_dispute_objection_reasons_dispute_case"
        FOREIGN KEY ("dispute_case_id") REFERENCES "dispute_cases"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_dispute_objection_reasons_case_id"
        ON "dispute_objection_reasons" ("dispute_case_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_dispute_objection_reasons_case_id"`);
    await queryRunner.query(`ALTER TABLE "dispute_objection_reasons" DROP CONSTRAINT "FK_dispute_objection_reasons_dispute_case"`);
    await queryRunner.query(`DROP TABLE "dispute_objection_reasons"`);
  }
}
