import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDisputeAiSnapshots1779300000000 implements MigrationInterface {
  name = 'CreateDisputeAiSnapshots1779300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "dispute_ai_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "dispute_case_id" uuid NOT NULL,
        "context" jsonb NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dispute_ai_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_dispute_ai_snapshots_case" UNIQUE ("dispute_case_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "dispute_ai_snapshots"
        ADD CONSTRAINT "FK_dispute_ai_snapshots_dispute_case"
        FOREIGN KEY ("dispute_case_id") REFERENCES "dispute_cases"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_dispute_ai_snapshots_case_id"
        ON "dispute_ai_snapshots" ("dispute_case_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_dispute_ai_snapshots_case_id"`);
    await queryRunner.query(`ALTER TABLE "dispute_ai_snapshots" DROP CONSTRAINT "FK_dispute_ai_snapshots_dispute_case"`);
    await queryRunner.query(`DROP TABLE "dispute_ai_snapshots"`);
  }
}
