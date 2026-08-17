import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `document_type` to `assessment_documents` so the upload endpoint can tell what was
 * uploaded. Without it, "Land value and benchmark report uploaded" is unknowable at upload time —
 * the only thing that knows document types today is an LLM classifier that runs much later and
 * never persists its answer.
 *
 * The vocabulary is deliberately the SAME one that classifier already speaks
 * (src/api/supporting-evidence/shared/pdf-extractor.service.ts), rather than a third spelling:
 *   land_tax_notice | benchmark_report | sales_report | land_value_search
 *
 * Nullable with NO backfill. The precedent to avoid is 1778200000000, which backfilled every
 * pre-existing document's name to the literal 'Land Tax Assessment Notice' — a guess that is now
 * indistinguishable from fact. An unclassified document is NULL, never a real type, so the
 * reports-uploaded gate can only fire on documents someone actually classified.
 *
 * TEXT + CHECK rather than a PG enum: adding a document type later is then an ALTER of the
 * constraint instead of a type rebuild, and this column has no ordering semantics to protect.
 */
export class AddDocumentTypeToAssessmentDocuments1785820000000 implements MigrationInterface {
  name = 'AddDocumentTypeToAssessmentDocuments1785820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE assessment_documents
        ADD COLUMN IF NOT EXISTS document_type TEXT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE assessment_documents
        DROP CONSTRAINT IF EXISTS "CHK_assessment_documents_document_type"
    `);
    await queryRunner.query(`
      ALTER TABLE assessment_documents
        ADD CONSTRAINT "CHK_assessment_documents_document_type"
        CHECK (document_type IS NULL OR document_type IN (
          'land_tax_notice', 'benchmark_report', 'sales_report', 'land_value_search'
        ))
    `);

    // The reports-uploaded gate probes by case + type; without this it is a seq scan on every
    // document upload.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_assessment_documents_case_type"
        ON assessment_documents (dispute_case_id, document_type)
    `);
  }

  /**
   * Drops the index and the check constraint but KEEPS the column, so a revert is non-destructive.
   *
   * up() has no backfill by design, which means the classification held in this column exists only
   * because a person or the upload API supplied it — nothing can recompute it. Dropping it would
   * leave every document unclassified on re-apply, and since document_type gates
   * tnc_agreed -> reports_uploaded (AssessmentDocumentsRepository) every affected case would be
   * stranded until each of its documents was re-uploaded or re-typed by hand.
   *
   * The column is nullable, so the previous application version neither writes nor reads it.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_assessment_documents_case_type"`,
    );
    await queryRunner.query(`
      ALTER TABLE assessment_documents
        DROP CONSTRAINT IF EXISTS "CHK_assessment_documents_document_type"
    `);
  }
}
