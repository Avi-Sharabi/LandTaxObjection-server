import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes `audit_logs` able to answer "who moved this case, from what, to what, and why".
 *
 * Today the table records an action and an actor but not the transition, which makes it useless
 * for reconstructing a case's history — the reason every status change had to be inferred from
 * scattered timestamp columns.
 *
 * All four columns are nullable with no backfill: historical rows genuinely do not know their
 * from/to statuses, and inventing them would be worse than leaving them null.
 *
 * from_status / to_status are TEXT, not the enum, deliberately. An audit row must remain readable
 * after the next vocabulary change; binding it to dispute_cases_status_enum would mean a future
 * status removal either rewrites history or blocks the migration.
 */
export class AddStatusFieldsToAuditLogs1785810000000 implements MigrationInterface {
  name = 'AddStatusFieldsToAuditLogs1785810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit_logs
        ADD COLUMN IF NOT EXISTS from_status       TEXT NULL,
        ADD COLUMN IF NOT EXISTS to_status         TEXT NULL,
        ADD COLUMN IF NOT EXISTS performed_by_role TEXT NULL,
        ADD COLUMN IF NOT EXISTS reason            TEXT NULL
    `);
    // No index added: audit_logs is write-only across the whole codebase — nothing selects from
    // it — and IDX_audit_logs_case_id already covers a per-case lookup if a reader ever appears.
  }

  /**
   * Deliberately a NO-OP, and deliberately asymmetric with up().
   *
   * audit_logs is an append-only compliance record. `reason` is the mandatory justification on
   * every STATUS_FORCED admin override, and from_status/to_status/performed_by_role are the only
   * record of who moved a case and why. Dropping the columns would erase that for every row with
   * no recovery path — and a revert of THIS migration is not even the usual reason someone would
   * run it, since reverting past it to reach ReplaceDisputeStatusVocabulary would destroy the
   * trail as a side effect.
   *
   * All four columns are nullable, so leaving them in place is invisible to the previous
   * application version: its inserts omit them and its selects never ask for them.
   */
  public async down(): Promise<void> {
    // Intentionally empty — see above.
  }
}
