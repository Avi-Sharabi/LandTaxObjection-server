/**
 * All SQL against `property_sales_archives` — the KAN-241 download ledger.
 *
 * Every function takes an explicit `QueryRunner` rather than injecting a
 * `DataSource`, mirroring nsw-property-sales-poc/src/persistence/
 * ingestion-run-repository.ts's `PoolClient`-per-call shape. This matters
 * for real correctness here, not just style: the sweep orchestrator holds
 * ONE dedicated `QueryRunner` (one physical connection) for an entire sweep
 * so the session-scoped advisory lock (see psi-advisory-lock.ts) and every
 * ledger write in that sweep share the same session — acquiring the lock on
 * one pooled connection and writing through another would silently defeat
 * it.
 *
 * The conditional `UPDATE ... WHERE ...` / `ON CONFLICT ... WHERE ...`
 * shapes here don't map onto TypeORM's repository API, so this uses raw
 * parameterized SQL via `queryRunner.query()` — the same convention this
 * repo's own `HardDeleteCleanupTask` already uses for non-CRUD writes.
 */

import type { QueryRunner } from 'typeorm';

export interface ClaimForDownloadInput {
  readonly sourceUrl: string;
  readonly archiveFilename: string;
  /** `YYYY-MM-DD`. */
  readonly releaseDate: string;
}

/**
 * Atomically claims one archive for download: inserts a fresh `discovered`
 * → `downloading` row, or — if `source_url` already has a row — flips it to
 * `downloading` ONLY when its current status is retryable
 * (`discovered` / `download_failed` / `quarantined`, or absent entirely).
 *
 * Returns the claimed row's id, or `null` if nothing was claimed: either
 * another replica's sweep already holds it (status is already
 * `downloading`), or it is already past this stage (`downloaded` / `loading`
 * / `loaded`) — both are "skip this one", not an error.
 *
 * This is the per-archive concurrency guard, independent of and in addition
 * to the sweep-level advisory lock: it is what makes two replicas racing on
 * the *same* archive safe even if they somehow both got past the advisory
 * lock (e.g. a second sweep starting the instant the first releases it).
 */
export interface ClaimedArchive {
  readonly id: string;
  /** Includes this attempt. Used to decide download_failed vs. quarantined after repeated failures. */
  readonly attemptCount: number;
}

export async function claimForDownload(
  queryRunner: QueryRunner,
  input: ClaimForDownloadInput,
): Promise<ClaimedArchive | null> {
  const rows: Array<{ id: string; attempt_count: number }> = await queryRunner.query(
    `INSERT INTO property_sales_archives
       (source_url, archive_filename, release_date, status, download_started_at, attempt_count)
     VALUES ($1, $2, $3, 'downloading', now(), 1)
     ON CONFLICT (source_url) DO UPDATE SET
       status = 'downloading',
       download_started_at = now(),
       attempt_count = property_sales_archives.attempt_count + 1,
       error_code = NULL,
       error_message = NULL
     WHERE property_sales_archives.status NOT IN ('downloading', 'downloaded', 'loading', 'loaded')
     RETURNING id, attempt_count`,
    [input.sourceUrl, input.archiveFilename, input.releaseDate],
  );
  const row = rows[0];
  return row ? { id: row.id, attemptCount: row.attempt_count } : null;
}

export interface MarkDownloadedInput {
  readonly localPath: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly entryCount: number;
}

export async function markDownloaded(
  queryRunner: QueryRunner,
  id: string,
  input: MarkDownloadedInput,
): Promise<void> {
  await queryRunner.query(
    `UPDATE property_sales_archives
     SET status = 'downloaded',
         downloaded_at = now(),
         local_path = $2,
         size_bytes = $3,
         sha256 = $4,
         entry_count = $5,
         error_code = NULL,
         error_message = NULL
     WHERE id = $1`,
    [id, input.localPath, input.sizeBytes, input.sha256, input.entryCount],
  );
}

/**
 * Deliberately does NOT set `local_path`: by the time a download attempt
 * fails, `downloadViaBrowser`'s own cleanup has already deleted the
 * `.part`/GUID file — there are no bytes left anywhere to point at. This
 * status is a pure "stop auto-retrying this URL" marker, not a reference to
 * a retained artifact — see property-sales-download.service.ts's header
 * comment for the full reasoning.
 */
export async function markQuarantined(
  queryRunner: QueryRunner,
  id: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  await queryRunner.query(
    `UPDATE property_sales_archives
     SET status = 'quarantined', error_code = $2, error_message = $3
     WHERE id = $1`,
    [id, errorCode, errorMessage],
  );
}

export async function markDownloadFailed(
  queryRunner: QueryRunner,
  id: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  await queryRunner.query(
    `UPDATE property_sales_archives
     SET status = 'download_failed', error_code = $2, error_message = $3
     WHERE id = $1`,
    [id, errorCode, errorMessage],
  );
}

/**
 * One query, run before any download: which of these candidate URLs already
 * have a ledger row, and in what status. The sweep drops any candidate whose
 * status is `downloaded` / `loading` / `loaded` / `load_failed` / `deleted`
 * — this IS the "don't re-download" guarantee the ledger exists for.
 */
export async function findStatusesByUrl(
  queryRunner: QueryRunner,
  sourceUrls: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (sourceUrls.length === 0) return new Map();
  const rows: Array<{ source_url: string; status: string }> = await queryRunner.query(
    `SELECT source_url, status FROM property_sales_archives WHERE source_url = ANY($1::text[])`,
    [sourceUrls],
  );
  return new Map(rows.map((row) => [row.source_url, row.status]));
}

/**
 * Operator recovery path for a republished week (same URL, different
 * bytes) — the normal sweep never re-fetches a `downloaded` row, by design.
 * Resets matching rows back to `discovered` so the next sweep's atomic
 * claim treats them as retryable again.
 *
 * Deliberately scoped to `downloaded` / `download_failed` / `quarantined`
 * only — `loading` / `loaded` / `load_failed` are excluded even if their
 * `release_date` matches, because KAN-242 may already have parsed and
 * inserted that archive's rows into `property_sales_raw`; clobbering the
 * ledger status here would desynchronise it from data that already exists
 * downstream, which is outside this ticket's authority to fix. Returns the
 * count reset, for logging.
 */
export async function resetForForceRedownload(
  queryRunner: QueryRunner,
  sinceReleaseDate: string,
): Promise<number> {
  const rows: Array<{ id: string }> = await queryRunner.query(
    `UPDATE property_sales_archives
     SET status = 'discovered', error_code = NULL, error_message = NULL
     WHERE release_date >= $1::date
       AND status IN ('downloaded', 'download_failed', 'quarantined')
     RETURNING id`,
    [sinceReleaseDate],
  );
  return rows.length;
}

/**
 * Reclaims `downloading` rows abandoned by a crashed sweep (the process
 * died mid-download, so nothing ever transitioned them onward) — otherwise
 * they would block that URL forever, since `claimForDownload` refuses to
 * re-claim an already-`downloading` row. Returns the count reclaimed, for
 * logging.
 */
export async function reclaimStaleDownloading(
  queryRunner: QueryRunner,
  staleMinutes: number,
): Promise<number> {
  const rows: Array<{ id: string }> = await queryRunner.query(
    `UPDATE property_sales_archives
     SET status = 'download_failed', error_code = 'DOWNLOAD_ABANDONED',
         error_message = 'Reclaimed: stuck in downloading past PSI_DOWNLOAD_STALE_MINUTES'
     WHERE status = 'downloading'
       AND download_started_at < now() - ($1::int * interval '1 minute')
     RETURNING id`,
    [staleMinutes],
  );
  return rows.length;
}
