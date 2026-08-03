/**
 * Prevents overlapping download sweeps with a session-scoped Postgres
 * advisory lock, held on a `QueryRunner` dedicated to the whole sweep.
 *
 * Ported from nsw-property-sales-poc/src/persistence/advisory-lock.ts
 * (KAN-241). Adaptation: `PoolClient` (node-pg) → TypeORM `QueryRunner`,
 * since this repo's DB access goes through TypeORM's `DataSource`, not a
 * bare `pg.Pool`. Everything else — the choice of `pg_try_advisory_lock`
 * over the blocking variant, and of a session lock over a transaction one
 * — carries over verbatim, for the same reasons:
 *
 * Deliberately `pg_try_advisory_lock` (non-blocking), not the blocking
 * `pg_advisory_lock`: a slow sweep should make the next cron tick skip
 * immediately, not queue up a second Node process (and a second headless
 * Chrome) waiting behind it. And deliberately a *session* lock, not
 * `pg_advisory_xact_lock`: an xact lock releases at COMMIT, which happens
 * before the staging workspace is cleaned up — a second sweep could then
 * start while the first is still finishing. The session lock is held until
 * `release()` is called in the orchestrator's `finally` block, and is
 * released automatically by Postgres if the connection dies, so a crashed
 * sweep self-heals on the next attempt.
 *
 * Advisory locks are scoped per-database and require a direct connection —
 * they are not honoured across PgBouncer transaction-pooling connections.
 */

import type { Logger } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';

/**
 * Arbitrary, stable, 32-bit-safe key identifying "the property-sales
 * download sweep lock" — distinct from any other advisory lock key used
 * elsewhere in this codebase. The `241` suffix is a deliberate mnemonic for
 * KAN-241, to make the key easy to recognise in `pg_locks` during ops.
 */
const SWEEP_LOCK_KEY = 875_309_241;

export interface AdvisoryLock {
  release(): Promise<void>;
}

/**
 * Attempts to acquire the sweep lock on `queryRunner`. Returns `null`
 * immediately if another session already holds it — the caller should
 * treat that as `skipped_concurrent`, not an error.
 */
export async function acquireSweepLock(
  queryRunner: QueryRunner,
  logger: Logger,
): Promise<AdvisoryLock | null> {
  const result: Array<{ locked: boolean }> = await queryRunner.query(
    'SELECT pg_try_advisory_lock($1) AS locked',
    [SWEEP_LOCK_KEY],
  );
  const locked = result[0]?.locked ?? false;

  if (!locked) {
    logger.warn(`another download sweep already holds the advisory lock (key=${SWEEP_LOCK_KEY})`);
    return null;
  }

  logger.debug(`acquired advisory lock (key=${SWEEP_LOCK_KEY})`);
  let released = false;

  return {
    release: async () => {
      if (released) return;
      released = true;
      await queryRunner.query('SELECT pg_advisory_unlock($1)', [SWEEP_LOCK_KEY]);
      logger.debug(`released advisory lock (key=${SWEEP_LOCK_KEY})`);
    },
  };
}
