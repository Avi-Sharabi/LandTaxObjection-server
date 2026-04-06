import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAnalysisReportUrlToDisputeCases1775478584516 implements MigrationInterface {
    name = 'AddAnalysisReportUrlToDisputeCases1775478584516'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" DROP CONSTRAINT "FK_valuation_notice_files_confirmer"`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" DROP CONSTRAINT "FK_valuation_notice_files_uploader"`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" DROP CONSTRAINT "FK_valuation_notice_files_notice"`);
        await queryRunner.query(`ALTER TABLE "constraint_files" DROP CONSTRAINT "FK_constraint_files_confirmer"`);
        await queryRunner.query(`ALTER TABLE "constraint_files" DROP CONSTRAINT "FK_constraint_files_uploader"`);
        await queryRunner.query(`ALTER TABLE "constraint_files" DROP CONSTRAINT "FK_constraint_files_dispute_constraint"`);
        await queryRunner.query(`ALTER TABLE "dispute_constraints" DROP CONSTRAINT "FK_dispute_constraints_dispute"`);
        await queryRunner.query(`ALTER TABLE "package_documents" DROP CONSTRAINT "FK_package_documents_dispute_case"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_valuation_notice_files_notice"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_valuation_notice_files_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_constraint_files_constraint"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_constraint_files_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dispute_constraints_dispute"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_package_documents_dispute_case_id"`);

        // Add new column
        await queryRunner.query(`ALTER TABLE "dispute_cases" ADD "analysis_report_url" text`);

        // valuation_notice_files — upload_status
        await queryRunner.query(`ALTER TYPE "public"."upload_status_enum" RENAME TO "upload_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."valuation_notice_files_upload_status_enum" AS ENUM('pending', 'scanning', 'complete', 'failed', 'rejected')`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ALTER COLUMN "upload_status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ALTER COLUMN "upload_status" TYPE "public"."valuation_notice_files_upload_status_enum" USING "upload_status"::"text"::"public"."valuation_notice_files_upload_status_enum"`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ALTER COLUMN "upload_status" SET DEFAULT 'pending'`);

        // constraint_files — upload_status (migrate before dropping old type)
        await queryRunner.query(`CREATE TYPE "public"."constraint_files_upload_status_enum" AS ENUM('pending', 'scanning', 'complete', 'failed', 'rejected')`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ALTER COLUMN "upload_status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ALTER COLUMN "upload_status" TYPE "public"."constraint_files_upload_status_enum" USING "upload_status"::"text"::"public"."constraint_files_upload_status_enum"`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ALTER COLUMN "upload_status" SET DEFAULT 'pending'`);

        // Now safe to drop old type — both tables have migrated off it
        await queryRunner.query(`DROP TYPE "public"."upload_status_enum_old"`);

        // valuation_notice_files — uploaded_by_role
        await queryRunner.query(`ALTER TYPE "public"."uploaded_by_role_enum" RENAME TO "uploaded_by_role_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."valuation_notice_files_uploaded_by_role_enum" AS ENUM('client', 'staff', 'staff_on_behalf_of_client')`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ALTER COLUMN "uploaded_by_role" TYPE "public"."valuation_notice_files_uploaded_by_role_enum" USING "uploaded_by_role"::"text"::"public"."valuation_notice_files_uploaded_by_role_enum"`);

        // constraint_files — uploaded_by_role (migrate before dropping old type)
        await queryRunner.query(`CREATE TYPE "public"."constraint_files_uploaded_by_role_enum" AS ENUM('client', 'staff', 'staff_on_behalf_of_client')`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ALTER COLUMN "uploaded_by_role" TYPE "public"."constraint_files_uploaded_by_role_enum" USING "uploaded_by_role"::"text"::"public"."constraint_files_uploaded_by_role_enum"`);

        // Now safe to drop old type
        await queryRunner.query(`DROP TYPE "public"."uploaded_by_role_enum_old"`);

        // dispute_cases — status enum
        await queryRunner.query(`ALTER TYPE "public"."dispute_cases_status_enum" RENAME TO "dispute_cases_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."dispute_cases_status_enum" AS ENUM('draft', 'grounds_selection', 'evidence_compilation', 'appraisal', 'advisory_letter_issued', 'objection_package_prepared', 'awaiting_client_approval', 'submitted_to_vg', 'awaiting_vg_response', 'outcome_received', 'closed', 'closed_no_objection')`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ALTER COLUMN "status" TYPE "public"."dispute_cases_status_enum" USING "status"::"text"::"public"."dispute_cases_status_enum"`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ALTER COLUMN "status" SET DEFAULT 'draft'`);
        await queryRunner.query(`DROP TYPE "public"."dispute_cases_status_enum_old"`);

        // package_documents — category enum
        await queryRunner.query(`ALTER TYPE "public"."package_document_category_enum" RENAME TO "package_document_category_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."package_documents_category_enum" AS ENUM('notice_of_objection', 'comparable_sales_report', 'mass_appraisal_deviation_report', 'site_constraints_summary', 'supporting_uploads')`);
        await queryRunner.query(`ALTER TABLE "package_documents" ALTER COLUMN "category" TYPE "public"."package_documents_category_enum" USING "category"::"text"::"public"."package_documents_category_enum"`);
        await queryRunner.query(`DROP TYPE "public"."package_document_category_enum_old"`);

        // package_documents — status enum
        await queryRunner.query(`ALTER TYPE "public"."package_document_status_enum" RENAME TO "package_document_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."package_documents_status_enum" AS ENUM('ready', 'missing', 'pending')`);
        await queryRunner.query(`ALTER TABLE "package_documents" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "package_documents" ALTER COLUMN "status" TYPE "public"."package_documents_status_enum" USING "status"::"text"::"public"."package_documents_status_enum"`);
        await queryRunner.query(`ALTER TABLE "package_documents" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."package_document_status_enum_old"`);

        // Restore FK constraints and indexes
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ADD CONSTRAINT "FK_504c60b28a13755feb0d8728300" FOREIGN KEY ("valuation_notice_id") REFERENCES "valuation_notices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ADD CONSTRAINT "FK_dda6ac47ecc9522b4f27487f186" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ADD CONSTRAINT "FK_aa89b968fa3f01a15ad921d57d6" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ADD CONSTRAINT "FK_b295907c45bd6040ac980f4cdc0" FOREIGN KEY ("dispute_constraint_id") REFERENCES "dispute_constraints"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ADD CONSTRAINT "FK_6e1d831b1e74539a5049f29befa" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ADD CONSTRAINT "FK_ed70a4fcd3c184045730b93598c" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_constraints" ADD CONSTRAINT "FK_5a08258aa76efefea969b1da0d4" FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "package_documents" ADD CONSTRAINT "FK_c1fafd23ccff8ed9ca92b089bdc" FOREIGN KEY ("dispute_case_id") REFERENCES "dispute_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "package_documents" DROP CONSTRAINT "FK_c1fafd23ccff8ed9ca92b089bdc"`);
        await queryRunner.query(`ALTER TABLE "dispute_constraints" DROP CONSTRAINT "FK_5a08258aa76efefea969b1da0d4"`);
        await queryRunner.query(`ALTER TABLE "constraint_files" DROP CONSTRAINT "FK_ed70a4fcd3c184045730b93598c"`);
        await queryRunner.query(`ALTER TABLE "constraint_files" DROP CONSTRAINT "FK_6e1d831b1e74539a5049f29befa"`);
        await queryRunner.query(`ALTER TABLE "constraint_files" DROP CONSTRAINT "FK_b295907c45bd6040ac980f4cdc0"`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" DROP CONSTRAINT "FK_aa89b968fa3f01a15ad921d57d6"`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" DROP CONSTRAINT "FK_dda6ac47ecc9522b4f27487f186"`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" DROP CONSTRAINT "FK_504c60b28a13755feb0d8728300"`);

        await queryRunner.query(`CREATE TYPE "public"."package_document_status_enum_old" AS ENUM('ready', 'missing', 'pending')`);
        await queryRunner.query(`ALTER TABLE "package_documents" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "package_documents" ALTER COLUMN "status" TYPE "public"."package_document_status_enum_old" USING "status"::"text"::"public"."package_document_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "package_documents" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."package_documents_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."package_document_status_enum_old" RENAME TO "package_document_status_enum"`);

        await queryRunner.query(`CREATE TYPE "public"."package_document_category_enum_old" AS ENUM('notice_of_objection', 'comparable_sales_report', 'mass_appraisal_deviation_report', 'site_constraints_summary', 'supporting_uploads')`);
        await queryRunner.query(`ALTER TABLE "package_documents" ALTER COLUMN "category" TYPE "public"."package_document_category_enum_old" USING "category"::"text"::"public"."package_document_category_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."package_documents_category_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."package_document_category_enum_old" RENAME TO "package_document_category_enum"`);

        await queryRunner.query(`CREATE TYPE "public"."dispute_cases_status_enum_old" AS ENUM('draft', 'grounds_selection', 'evidence_compilation', 'appraisal', 'advisory_letter_issued', 'objection_package_prepared', 'awaiting_client_approval', 'submitted_to_vg', 'awaiting_vg_response', 'outcome_received', 'closed')`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ALTER COLUMN "status" TYPE "public"."dispute_cases_status_enum_old" USING "status"::"text"::"public"."dispute_cases_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ALTER COLUMN "status" SET DEFAULT 'draft'`);
        await queryRunner.query(`DROP TYPE "public"."dispute_cases_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."dispute_cases_status_enum_old" RENAME TO "dispute_cases_status_enum"`);

        await queryRunner.query(`CREATE TYPE "public"."uploaded_by_role_enum_old" AS ENUM('client', 'staff', 'staff_on_behalf_of_client')`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ALTER COLUMN "uploaded_by_role" TYPE "public"."uploaded_by_role_enum_old" USING "uploaded_by_role"::"text"::"public"."uploaded_by_role_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."constraint_files_uploaded_by_role_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."uploaded_by_role_enum_old" RENAME TO "uploaded_by_role_enum"`);

        await queryRunner.query(`CREATE TYPE "public"."upload_status_enum_old" AS ENUM('pending', 'scanning', 'complete', 'failed', 'rejected')`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ALTER COLUMN "upload_status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ALTER COLUMN "upload_status" TYPE "public"."upload_status_enum_old" USING "upload_status"::"text"::"public"."upload_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ALTER COLUMN "upload_status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."constraint_files_upload_status_enum"`);

        await queryRunner.query(`CREATE TYPE "public"."uploaded_by_role_enum_old" AS ENUM('client', 'staff', 'staff_on_behalf_of_client')`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ALTER COLUMN "uploaded_by_role" TYPE "public"."uploaded_by_role_enum_old" USING "uploaded_by_role"::"text"::"public"."uploaded_by_role_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."valuation_notice_files_uploaded_by_role_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."uploaded_by_role_enum_old" RENAME TO "uploaded_by_role_enum"`);

        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ALTER COLUMN "upload_status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ALTER COLUMN "upload_status" TYPE "public"."upload_status_enum_old" USING "upload_status"::"text"::"public"."upload_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ALTER COLUMN "upload_status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."valuation_notice_files_upload_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."upload_status_enum_old" RENAME TO "upload_status_enum"`);

        await queryRunner.query(`ALTER TABLE "dispute_cases" DROP COLUMN "analysis_report_url"`);

        await queryRunner.query(`CREATE INDEX "IDX_package_documents_dispute_case_id" ON "package_documents" ("dispute_case_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_dispute_constraints_dispute" ON "dispute_constraints" ("dispute_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_constraint_files_status" ON "constraint_files" ("upload_status") `);
        await queryRunner.query(`CREATE INDEX "IDX_constraint_files_constraint" ON "constraint_files" ("dispute_constraint_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_valuation_notice_files_status" ON "valuation_notice_files" ("upload_status") `);
        await queryRunner.query(`CREATE INDEX "IDX_valuation_notice_files_notice" ON "valuation_notice_files" ("valuation_notice_id") `);
        await queryRunner.query(`ALTER TABLE "package_documents" ADD CONSTRAINT "FK_package_documents_dispute_case" FOREIGN KEY ("dispute_case_id") REFERENCES "dispute_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_constraints" ADD CONSTRAINT "FK_dispute_constraints_dispute" FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ADD CONSTRAINT "FK_constraint_files_dispute_constraint" FOREIGN KEY ("dispute_constraint_id") REFERENCES "dispute_constraints"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ADD CONSTRAINT "FK_constraint_files_uploader" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "constraint_files" ADD CONSTRAINT "FK_constraint_files_confirmer" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ADD CONSTRAINT "FK_valuation_notice_files_notice" FOREIGN KEY ("valuation_notice_id") REFERENCES "valuation_notices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ADD CONSTRAINT "FK_valuation_notice_files_uploader" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "valuation_notice_files" ADD CONSTRAINT "FK_valuation_notice_files_confirmer" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }
}