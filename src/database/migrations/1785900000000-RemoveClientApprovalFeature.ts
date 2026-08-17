import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes the client-approval feature from dispute_cases.
 *
 * Approval of the objection package stopped gating lodgement when
 * ReplaceDisputeStatusVocabulary landed — onObjectionSubmitted is a plain manual move and the
 * accountant lodges on their own authority. These six columns are what remained of the machinery
 * that served that gate: the two timestamps, the token pair behind the public approve endpoint,
 * and the reminder counters the approval cron wrote.
 *
 * Dropping the timestamps discards the record that a client ever approved a package. That is
 * deliberate and was decided explicitly — it is not recoverable from anywhere else.
 *
 * Do NOT confuse these with advisory_view_token / advisory_view_token_expires_at, which belong to
 * the no-objection advisory close and are still live.
 */
export class RemoveClientApprovalFeature1785900000000 implements MigrationInterface {
  name = 'RemoveClientApprovalFeature1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        DROP COLUMN IF EXISTS client_approval_requested_at,
        DROP COLUMN IF EXISTS client_approved_at,
        DROP COLUMN IF EXISTS client_approval_token,
        DROP COLUMN IF EXISTS client_approval_token_expires_at,
        DROP COLUMN IF EXISTS last_reminder_sent_at,
        DROP COLUMN IF EXISTS reminder_count
    `);

    // The three approval NotificationType members were deleted from the enum in the same change.
    // notifications.type is TEXT, so nothing failed — but the rows survive, and they ask the user
    // to act on an approval flow that no longer exists. NotificationResponseDto advertises the
    // narrowed enum, so leaving them also means the API returns values its own contract excludes.
    await queryRunner.query(`
      DELETE FROM notifications
       WHERE type IN ('approval_requested', 'approval_reminder', 'approval_reminder_max_reached')
    `);
  }

  /**
   * Re-adds all six columns, empty. This is NOT cosmetic and must not be reduced to a no-op.
   *
   * 1785800000000-ReplaceDisputeStatusVocabulary.down() reads client_approval_requested_at and
   * client_approved_at to rebuild the old awaiting_client_approval / client_approved statuses.
   * TypeORM reverts newest-first, so without this the operator reverting past that migration hits
   * `column does not exist` and cannot get back to the previous application version at all.
   *
   * The data is gone, so that reverse mapping will classify those rows as
   * objection_package_prepared rather than the two approval statuses. That is the correct
   * consequence of the columns having been dropped, not a bug in either migration.
   *
   * Column definitions mirror their original creators: 1773800000000-CreateBaseTables (the two
   * timestamps), 1775500000000-AddApprovalTokenToDisputeCases (the token pair) and
   * 1775600000000-AddReminderFieldsToDisputeCases (the reminder columns).
   *
   * The deleted approval notifications are NOT restored — they are gone, and they described a
   * flow the reverted version would re-create from scratch anyway.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN IF NOT EXISTS client_approval_requested_at     TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS client_approved_at               TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS client_approval_token            UUID NULL,
        ADD COLUMN IF NOT EXISTS client_approval_token_expires_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS last_reminder_sent_at            TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS reminder_count                   SMALLINT NOT NULL DEFAULT 0
    `);
  }
}
