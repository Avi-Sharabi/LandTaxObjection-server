import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDisputeEvidenceIssues1778300000000 implements MigrationInterface {
  name = 'CreateDisputeEvidenceIssues1778300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "dispute_evidence_issues" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "dispute_case_id" uuid NOT NULL,
        "issue_type" text NOT NULL,
        "is_tick" boolean NOT NULL DEFAULT false,
        "confidence" text,
        "trigger" text,
        "text_box_content" text,
        "documents_to_attach" jsonb,
        "run_id" bigint NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dispute_evidence_issues" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "dispute_evidence_issues"
        ADD CONSTRAINT "FK_dispute_evidence_issues_dispute_case"
        FOREIGN KEY ("dispute_case_id") REFERENCES "dispute_cases"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dispute_evidence_issues" DROP CONSTRAINT "FK_dispute_evidence_issues_dispute_case"`);
    await queryRunner.query(`DROP TABLE "dispute_evidence_issues"`);
  }
}
