import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Consolidates every free-text note about a transition onto the audit row that records it.
 *
 * Two changes, one idea:
 *  - `audit_logs.reason` -> `audit_logs.notes`. The column already carried more than
 *    justifications (markAnalysed writes its source there), and the API field, the UI label and
 *    the column now all read "notes".
 *  - `dispute_cases.vg_response_notes` is dropped. It accumulated every VG response into one
 *    per-case blob via appendNote, which meant the notes for a specific response could not be
 *    told apart, and a cyclic case (vg_response_received <-> ai_further_submission) mixed
 *    several rounds together. The audit trail already records one row per event, so the notes
 *    belong there.
 *
 * NO DATA MIGRATION. Confirmed with the product owner that existing vg_response_notes content
 * is test data only. Anything in that column is destroyed by this migration.
 *
 * ROLLBACK CAVEAT — down() re-creates vg_response_notes EMPTY, and that matters beyond this
 * file. 1785800000000-ReplaceDisputeStatusVocabulary.down() reconstructs the legacy
 * `vg_declined` status by matching a marker it wrote into vg_response_notes:
 *
 *     WHEN dc.status = 'vg_response_received'
 *          AND dc.vg_response_notes LIKE '%previous status was vg_declined.%'
 *
 * Re-creating the column keeps that statement RUNNABLE (it would otherwise throw on a missing
 * column), but the marker is gone, so every vg_response_received case rolls back to
 * `for_review` and none to `vg_declined`. The rollback completes; it is just less faithful.
 * Recording that here because the failure is silent and would otherwise be found by whoever
 * runs the rollback.
 */
export class RenameAuditReasonToNotesAndDropVgResponseNotes1786000000000 implements MigrationInterface {
  name = 'RenameAuditReasonToNotesAndDropVgResponseNotes1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // RENAME rather than add/copy/drop: it preserves every existing row's justification, which
    // is audit data and must survive.
    await queryRunner.query(
      `ALTER TABLE audit_logs RENAME COLUMN reason TO notes`,
    );
    await queryRunner.query(
      `ALTER TABLE dispute_cases DROP COLUMN IF EXISTS vg_response_notes`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE audit_logs RENAME COLUMN notes TO reason`,
    );
    // Re-created empty — see the ROLLBACK CAVEAT above before relying on its contents.
    await queryRunner.query(
      `ALTER TABLE dispute_cases ADD COLUMN IF NOT EXISTS vg_response_notes TEXT NULL`,
    );
  }
}
