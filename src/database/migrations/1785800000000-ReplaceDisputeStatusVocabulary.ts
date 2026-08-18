import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the 17-value dispute_cases_status_enum with the 9-value business vocabulary.
 *
 * A full type rebuild rather than incremental ALTER TYPE ... ADD VALUE, for two independent
 * reasons: values are being REMOVED and PostgreSQL has no DROP VALUE at any version; and most
 * of the nine labels are new, so the migration must write labels it also creates — which
 * ALTER TYPE ... ADD VALUE forbids inside a single transaction (see
 * 1777500000000-AddVgResponseStatuses). CREATE TYPE has no such restriction, so the whole up()
 * is transaction-safe.
 *
 * Mapping runs through a text staging column so it stays auditable and so an unmapped label
 * fails loudly, naming itself, instead of dying in an opaque cast error.
 *
 * down() is deliberately LOSSY — see the comment on down() for exactly what cannot be
 * recovered. Roll forward, not back, in production.
 */
export class ReplaceDisputeStatusVocabulary1785800000000 implements MigrationInterface {
  name = 'ReplaceDisputeStatusVocabulary1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Columns supporting the new YML further-submission loop. resubmitted_at is kept
    //    separate from submitted_at so the original lodgement date survives every round.
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN IF NOT EXISTS resubmitted_at     TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS resubmission_count SMALLINT NOT NULL DEFAULT 0
    `);

    // 2. Preserve the two decisions the 9-value vocabulary can no longer express as a status.
    //    vg_declined / vg_partially_agreed collapse into vg_response_received, so record the
    //    fact as data in `outcome` BEFORE the cast.
    //
    //    There is deliberately no prose marker written to vg_response_notes: 1786000000000 drops
    //    that column, so anything written here would be unreadable by the time down() ran.
    await queryRunner.query(`
      UPDATE dispute_cases SET outcome = 'rejected'
       WHERE outcome IS NULL AND status::text = 'vg_declined'
    `);
    await queryRunner.query(`
      UPDATE dispute_cases SET outcome = 'partially_upheld'
       WHERE outcome IS NULL AND status::text = 'vg_partially_agreed'
    `);

    // 3. Translate into a text staging column. status::text rather than enum literals, so a
    //    label absent from a given environment's type cannot make the statement error.
    //    Deliberately NO deleted_at filter: soft-deleted rows hold enum values too and would
    //    break the cast in step 6.
    //
    //    Three buckets, because a developer's DB may sit on an interim vocabulary:
    //      (a) the original 17 labels;
    //      (b) awaiting_vg_response, which 1778100000000 removed but its down() can re-add;
    //      (c) the interim 11 labels, which pass straight through (note vg_partially_agreed was
    //          NEVER one of the original 17 — it only ever existed in that interim state).
    await queryRunner.query(
      `ALTER TABLE dispute_cases ADD COLUMN IF NOT EXISTS status_new text`,
    );
    await queryRunner.query(`
      UPDATE dispute_cases SET status_new = CASE status::text
        -- (a) the original 17
        WHEN 'pending_tnc'                THEN 'created'
        WHEN 'draft'                      THEN 'created'
        WHEN 'grounds_selection'          THEN 'created'
        WHEN 'evidence_compilation'       THEN 'created'
        WHEN 'appraisal'                  THEN 'reports_uploaded'
        WHEN 'advisory_letter_issued'     THEN 'analysed'
        WHEN 'objection_package_prepared' THEN 'analysed'
        WHEN 'awaiting_client_approval'   THEN 'analysed'
        -- client_approved had documents and an appraisal already; tnc_agreed is now position 2,
        -- so mapping it there would read as a regression. The approval fact itself is discarded —
        -- 1785900000000 removes the feature and lodgement no longer depends on it.
        WHEN 'client_approved'            THEN 'analysed'
        WHEN 'submitted_to_vg'            THEN 'objection_submitted'
        WHEN 'vg_response_received'       THEN 'vg_response_received'
        WHEN 'for_review'                 THEN 'vg_response_received'
        WHEN 'outcome_received'           THEN 'vg_response_received'
        WHEN 'vg_declined'                THEN 'vg_response_received'
        WHEN 'vg_approved'                THEN 'vg_agreed'
        WHEN 'closed'                     THEN 'case_closed'
        WHEN 'closed_no_objection'        THEN 'case_closed'
        -- (b) defensive
        WHEN 'awaiting_vg_response'       THEN 'objection_submitted'
        -- (c) the interim 11 — passthrough, so re-running over a partly migrated DB is safe
        WHEN 'created'                    THEN 'created'
        WHEN 'tnc_agreed'                 THEN 'tnc_agreed'
        WHEN 'reports_uploaded'           THEN 'reports_uploaded'
        WHEN 'analysed'                   THEN 'analysed'
        WHEN 'objection_submitted'        THEN 'objection_submitted'
        WHEN 'vg_partially_agreed'        THEN 'vg_response_received'
        WHEN 'ai_further_submission'      THEN 'ai_further_submission'
        WHEN 'vg_agreed'                  THEN 'vg_agreed'
        WHEN 'case_closed'                THEN 'case_closed'
        ELSE NULL
      END
    `);

    // 4. The ELSE above yields NULL rather than a guessed status, so anything unmapped is NULL
    //    here. Report the labels we started from (for diagnosis) and fail naming the offender.
    await queryRunner.query(`
      DO $$
      DECLARE starting text; unmapped text;
      BEGIN
        SELECT string_agg(DISTINCT status::text, ', ' ORDER BY status::text) INTO starting
          FROM dispute_cases;
        RAISE NOTICE 'ReplaceDisputeStatusVocabulary: starting labels: %', COALESCE(starting, '(no rows)');
        SELECT string_agg(DISTINCT status::text, ', ') INTO unmapped
          FROM dispute_cases WHERE status_new IS NULL;
        IF unmapped IS NOT NULL THEN
          RAISE EXCEPTION 'ReplaceDisputeStatusVocabulary: unmapped dispute_cases.status value(s): %', unmapped;
        END IF;
      END $$
    `);

    // 5. The default references the old type and is not castable — drop before the type change.
    await queryRunner.query(
      `ALTER TABLE dispute_cases ALTER COLUMN status DROP DEFAULT`,
    );

    // 6. Rebuild the type. Same name (dispute_cases_status_enum) because the entity declares no
    //    enumName and TypeORM derives {table}_{column}_enum — a different name would make
    //    migration:generate emit a spurious enum diff forever. Labels are listed in lifecycle
    //    order, matching DISPUTE_STATUS_ORDER in src/api/dispute-cases/dispute-status.ts, so
    //    enumsortorder follows the lifecycle too.
    await queryRunner.query(
      `ALTER TYPE dispute_cases_status_enum RENAME TO dispute_cases_status_enum_old`,
    );
    await queryRunner.query(`
      CREATE TYPE dispute_cases_status_enum AS ENUM (
        'created',
        'tnc_agreed',
        'reports_uploaded',
        'analysed',
        'objection_submitted',
        'vg_response_received',
        'ai_further_submission',
        'vg_agreed',
        'case_closed'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ALTER COLUMN status TYPE dispute_cases_status_enum
        USING status_new::dispute_cases_status_enum
    `);

    await queryRunner.query(`ALTER TABLE dispute_cases DROP COLUMN status_new`);
    await queryRunner.query(
      `ALTER TABLE dispute_cases ALTER COLUMN status SET DEFAULT 'created'`,
    );
    await queryRunner.query(`DROP TYPE dispute_cases_status_enum_old`);

    // 7. Backfill the columns that now CARRY a distinction the status used to carry. Legacy rows
    //    were written with a status but no matching timestamp (out-of-band edits, and older
    //    seeders), so without this the re-expressed predicates regress on existing data:
    //      - submitted_at is now the sole test for "has this been lodged", used by the valuation
    //        report's controlled vocabulary. A lodged-status row with a null submitted_at would
    //        print "NOT YET LODGED" in a client-facing PDF.
    //      - closed_at is the companion fact to case_closed.
    //    updated_at is the closest available approximation of when the transition happened.
    //
    //    Nothing is backfilled for client approval: 1785900000000 drops that machinery outright,
    //    and lodgement no longer depends on it.
    await queryRunner.query(`
      UPDATE dispute_cases SET submitted_at = updated_at
       WHERE submitted_at IS NULL
         AND status IN ('objection_submitted', 'vg_response_received',
                        'ai_further_submission', 'vg_agreed')
    `);
    //    case_closed is deliberately absent from the submitted_at backfill above, because the old
    //    `closed` covered BOTH never-lodged advisory closes and lodged-then-finished cases. It is
    //    stamped separately here using the only discriminator that survives the collapse: the
    //    lodgement reference, which is minted at lodgement and never otherwise. Without this, a
    //    legacy lodged-then-closed row keeps submitted_at NULL and the client PDF prints
    //    "NOT YET LODGED" for a case that was, in fact, lodged.
    await queryRunner.query(`
      UPDATE dispute_cases SET submitted_at = updated_at
       WHERE submitted_at IS NULL
         AND status = 'case_closed'
         AND lodgment_reference_number IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE dispute_cases SET closed_at = updated_at
       WHERE closed_at IS NULL AND status = 'case_closed'
    `);

    // 8. Safety net. PostgreSQL rebuilds indexes automatically on ALTER COLUMN ... TYPE, so
    //    this is normally a no-op; it covers environments where an earlier down() dropped it.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_dispute_cases_status ON dispute_cases (status)`,
    );
  }

  /**
   * Best-effort inverse. It does NOT throw, because a throwing down() would leave an operator
   * mid-incident unable to run the previous application version at all.
   *
   * Recovered faithfully — the ONLY bucket whose discriminator survives the full migration set:
   *   case_closed   -> closed_no_objection when advisory_view_token is set, else closed
   *   tnc_agreed / objection_submitted / vg_agreed  -> their old names
   *
   * Columns added by up() are deliberately NOT dropped — see the note at the end of down().
   * A revert is therefore non-destructive: nothing this migration created is lost by going back.
   *
   * NOT recoverable — this migration is lossy in these cases:
   *   created               -> draft   (pending_tnc, grounds_selection, evidence_compilation gone)
   *   reports_uploaded      -> appraisal (evidence_compilation gone)
   *   vg_response_received  -> for_review for ALL rows, collapsing the old vg_response_received /
   *                            for_review / outcome_received split and the former vg_declined and
   *                            vg_partially_agreed populations. `outcome` still carries which of
   *                            those a row was, but it is not read here: up() only wrote it WHERE
   *                            it was NULL, so a row already marked 'rejected' at for_review is
   *                            indistinguishable and would come back as a status it was never in.
   *   ai_further_submission -> submitted_to_vg (no old equivalent)
   *   analysed              -> objection_package_prepared, or advisory_letter_issued when the
   *                            notice says ADVISORY. The client_approved and
   *                            awaiting_client_approval buckets CANNOT be rebuilt: their
   *                            discriminators (client_approved_at, client_approval_requested_at)
   *                            are dropped by 1785900000000, which re-adds them empty on the way
   *                            back so this statement still runs. That is expensive to get wrong
   *                            — the previous version gates lodgement on status='client_approved'
   *                            — but the data is gone and cannot be inferred. See that migration.
   *
   * Roll forward, not back, in production.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE dispute_cases ALTER COLUMN status DROP DEFAULT`,
    );

    // Demote to text first: the reverse mapping needs a join to valuation_notices, and an
    // ALTER TABLE ... USING expression cannot join.
    await queryRunner.query(
      `ALTER TABLE dispute_cases ALTER COLUMN status TYPE text USING status::text`,
    );

    await queryRunner.query(`
      UPDATE dispute_cases dc SET status = CASE
        WHEN dc.status = 'created'               THEN 'draft'
        WHEN dc.status = 'reports_uploaded'      THEN 'appraisal'
        -- No client_approved / awaiting_client_approval branch: 1785900000000 dropped the two
        -- timestamps that told them apart and re-adds them empty, so any test on them is dead
        -- code that always evaluates false. Every analysed row lands in one of the two below.
        WHEN dc.status = 'analysed'
             AND vn.decision_outcome = 'ADVISORY' THEN 'advisory_letter_issued'
        WHEN dc.status = 'analysed'              THEN 'objection_package_prepared'
        -- tnc_agreed now precedes documents, so pending_tnc is the closest old equivalent.
        WHEN dc.status = 'tnc_agreed'            THEN 'pending_tnc'
        WHEN dc.status = 'objection_submitted'   THEN 'submitted_to_vg'
        WHEN dc.status = 'ai_further_submission' THEN 'submitted_to_vg'
        -- Everything collapses to for_review. The outcome column is deliberately NOT used to pick
        -- out the old vg_declined rows: up() only writes it WHERE it was NULL, so a row already
        -- marked 'rejected' while sitting at for_review or outcome_received is indistinguishable
        -- and would come back as a status it was never in. Under-recovering is the safer error.
        WHEN dc.status = 'vg_response_received'  THEN 'for_review'
        WHEN dc.status = 'vg_agreed'             THEN 'vg_approved'
        WHEN dc.status = 'case_closed'
             AND dc.advisory_view_token IS NOT NULL THEN 'closed_no_objection'
        WHEN dc.status = 'case_closed'           THEN 'closed'
        ELSE dc.status
      END
      FROM valuation_notices vn
      WHERE vn.id = dc.valuation_notice_id
    `);

    await queryRunner.query(`DROP TYPE dispute_cases_status_enum`);
    await queryRunner.query(`
      CREATE TYPE dispute_cases_status_enum AS ENUM (
        'pending_tnc',
        'draft',
        'grounds_selection',
        'evidence_compilation',
        'appraisal',
        'advisory_letter_issued',
        'objection_package_prepared',
        'awaiting_client_approval',
        'client_approved',
        'submitted_to_vg',
        'vg_response_received',
        'vg_approved',
        'vg_declined',
        'for_review',
        'outcome_received',
        'closed',
        'closed_no_objection'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ALTER COLUMN status TYPE dispute_cases_status_enum
        USING status::dispute_cases_status_enum
    `);
    await queryRunner.query(
      `ALTER TABLE dispute_cases ALTER COLUMN status SET DEFAULT 'draft'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_dispute_cases_status ON dispute_cases (status)`,
    );

    // resubmitted_at and resubmission_count are deliberately NOT dropped. They are additive and
    // invisible to the previous application version — nothing there selects them, and
    // resubmission_count is NOT NULL DEFAULT 0 so its inserts still succeed. Dropping them would
    // make a revert destructive in a way up() cannot undo: re-running up() re-creates
    // resubmission_count at 0, and MAX_FURTHER_SUBMISSIONS is enforced from that column alone
    // (dispute-status-transition.service.ts), so a case that had exhausted its three further
    // submissions could silently send three more to the Valuer General.
  }
}
