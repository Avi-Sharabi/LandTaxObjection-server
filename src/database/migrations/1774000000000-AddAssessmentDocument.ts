import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAssessmentDocument1774000000000 implements MigrationInterface {
    name = 'AddAssessmentDocument1774000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "assessment_documents" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "client_id" uuid NOT NULL,
                "file_path" text,
                "notice_date" date NOT NULL,
                "valuation_year" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_assessment_documents" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "assessment_documents"
                ADD CONSTRAINT "FK_assessment_documents_client"
                FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "valuation_notices"
                ADD COLUMN "source_document_id" uuid
        `);
        await queryRunner.query(`
            ALTER TABLE "valuation_notices"
                ADD CONSTRAINT "FK_valuation_notices_source_document"
                FOREIGN KEY ("source_document_id") REFERENCES "assessment_documents"("id") ON DELETE SET NULL ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "valuation_notices" DROP CONSTRAINT "FK_valuation_notices_source_document"`);
        await queryRunner.query(`ALTER TABLE "valuation_notices" DROP COLUMN "source_document_id"`);
        await queryRunner.query(`ALTER TABLE "assessment_documents" DROP CONSTRAINT "FK_assessment_documents_client"`);
        await queryRunner.query(`DROP TABLE "assessment_documents"`);
    }
}
