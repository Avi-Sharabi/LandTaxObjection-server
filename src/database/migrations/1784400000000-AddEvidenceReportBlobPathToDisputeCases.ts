import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEvidenceReportBlobPathToDisputeCases1784400000000 implements MigrationInterface {
  name = 'AddEvidenceReportBlobPathToDisputeCases1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Blob path of the generated Evidence Score Report PDF — the sibling of
    // analysis_report_blob_path (the valuation report). Nullable: a case has no evidence report until
    // the analyze-ai pipeline or a recompute has produced one, and a case that has never been
    // scorable may never get one.
    //
    // Worth a column rather than deriving it from assessment_documents: that table has no column
    // distinguishing a pipeline artifact from a client upload, so "does this case have an evidence
    // report and where" would otherwise be a join plus a document_name string match. It is also the
    // completion signal for the queued generation job — without it, "the report is done" is
    // indistinguishable from "the previous report's file_path was rewritten".
    //
    // IF NOT EXISTS to match every other dispute_cases column migration in this tree (1775510000000,
    // 1784200000000): dev databases here routinely carry columns applied by since-removed generated
    // migrations, and without the guard `migration:run` aborts on 42701 duplicate_column.
    await queryRunner.query(
      `ALTER TABLE "dispute_cases" ADD COLUMN IF NOT EXISTS "evidence_report_blob_path" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "dispute_cases" DROP COLUMN IF EXISTS "evidence_report_blob_path"`,
    );
  }
}
