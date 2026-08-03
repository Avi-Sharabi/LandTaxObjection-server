/**
 * Sequences one weekly-archive-download sweep end to end: discover every
 * advertised weekly archive → drop the ones already held → download each
 * remaining one (oldest first) → record the outcome in the ledger.
 *
 * KAN-241 is download-only — nothing here reads or writes
 * `property_sales_raw`. This is the module's own port of
 * nsw-property-sales-poc/src/pipeline/run-pipeline.ts's *sequencing* idea
 * (lock → do the work → record outcomes → clean up), but the actual steps
 * differ substantially because that pipeline imports ONE already-downloaded
 * archive, while this one discovers and downloads potentially MANY archives
 * per sweep (catch-up) and stops before parsing.
 *
 * ## Quarantine, and why this ticket almost never writes it
 *
 * `downloadViaBrowser` (browser-downloader.util.ts) already deletes its own
 * `.part`/GUID file on every failure path — by the time an exception
 * reaches this service, there are no bytes left to move into quarantine.
 * So unlike the POC (which quarantines an already-downloaded archive that
 * later fails DAT-parsing, a stage this ticket doesn't reach),
 * `quarantined` here means something narrower and KAN-241-specific: "this
 * URL has failed to download repeatedly enough that automatic retry is no
 * longer useful." A failure below `MAX_ATTEMPTS_BEFORE_QUARANTINE` is
 * `download_failed` (retried automatically next sweep); at or beyond it,
 * the row is marked `quarantined` instead, so a permanently-blocked URL
 * stops consuming a slot in every sweep and instead surfaces for a human.
 */

import { mkdir, rename, statfs } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';

import { ArchiveStoreService } from './storage/archive-store.service';
import {
  claimForDownload,
  findStatusesByUrl,
  markDownloadFailed,
  markDownloaded,
  markQuarantined,
  reclaimStaleDownloading,
  resetForForceRedownload,
} from './archive-ledger.repository';
import { downloadViaBrowser } from './download/browser-downloader.util';
import { wrapPage } from './discovery/discovery-page.types';
import type { ArchiveCandidate } from './discovery/link-extractor.util';
import { SourceDiscoveryService } from './discovery/source-discovery.service';
import { describeError } from './exceptions/property-sales-ingestion.exception';
import { PropertySalesConfig } from './property-sales.config';
import { PsiBrowserService } from './shared/psi-browser.service';
import { acquireSweepLock } from './shared/psi-advisory-lock';

/** Statuses that mean "already handled" — a sweep never re-downloads these. */
const SKIP_STATUSES = new Set(['downloaded', 'loading', 'loaded', 'load_failed', 'deleted']);

/** Free space must be at least this many times the configured archive size ceiling before a sweep downloads anything. */
const MIN_FREE_DISK_MULTIPLIER = 3;

/** After this many failed attempts on the same URL, stop auto-retrying and mark it quarantined instead. */
const MAX_ATTEMPTS_BEFORE_QUARANTINE = 5;

export interface SweepOptions {
  /** Discover and log what would happen; download nothing, write nothing. */
  readonly dryRun?: boolean;
  /** Overrides PSI_MAX_ARCHIVES_PER_RUN for this call. */
  readonly maxArchives?: number;
  /** Only consider candidates whose release date is on or after this `YYYY-MM-DD`. */
  readonly sinceReleaseDate?: string;
  /**
   * Operator recovery for a republished week: only honoured together with
   * `sinceReleaseDate`. Resets already-`downloaded`/`download_failed`/
   * `quarantined` rows in that range back to `discovered` before the normal
   * claim flow runs, so they become eligible for re-download. Never touches
   * `loading`/`loaded`/`load_failed` — see resetForForceRedownload's doc.
   */
  readonly force?: boolean;
}

export interface SweepArchiveOutcome {
  readonly sourceUrl: string;
  readonly releaseDate: string;
  readonly status: 'downloaded' | 'download_failed' | 'quarantined' | 'skipped_claimed_elsewhere';
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface SweepResult {
  readonly status: 'completed' | 'failed' | 'skipped_concurrent' | 'skipped_disabled';
  readonly discoveredCount?: number;
  readonly consideredCount?: number;
  readonly outcomes?: readonly SweepArchiveOutcome[];
  readonly reclaimedStaleCount?: number;
  readonly forceResetCount?: number;
  readonly abortedReason?: 'insufficient_disk';
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

function basenameOfUrl(url: string): string {
  const pathname = new URL(url).pathname;
  return pathname.split('/').filter(Boolean).pop() ?? 'archive.zip';
}

@Injectable()
export class PropertySalesDownloadService {
  private readonly logger = new Logger(PropertySalesDownloadService.name);

  constructor(
    private readonly config: PropertySalesConfig,
    private readonly archiveStore: ArchiveStoreService,
    private readonly psiBrowser: PsiBrowserService,
    private readonly sourceDiscovery: SourceDiscoveryService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private logEvent(context: string, data: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ context, ...data, ts: new Date().toISOString() }));
  }

  private async hasEnoughFreeDisk(): Promise<boolean> {
    try {
      const stats = await statfs(this.config.archivesDir);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      const required = this.config.maxArchiveBytes * MIN_FREE_DISK_MULTIPLIER;
      if (freeBytes < required) {
        this.logger.warn(
          JSON.stringify({
            context: 'PropertySalesDownload.insufficientDisk',
            freeBytes,
            required,
            ts: new Date().toISOString(),
          }),
        );
        return false;
      }
      return true;
    } catch (err) {
      // Unknown rather than a real failure (unsupported platform, permission
      // issue) — proceed, per the documented fallback for this check.
      this.logger.warn(
        JSON.stringify({
          context: 'PropertySalesDownload.diskCheckFailed',
          reason: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        }),
      );
      return true;
    }
  }

  async runSweep(options: SweepOptions = {}): Promise<SweepResult> {
    if (!this.config.enabled) {
      this.logEvent('PropertySalesDownload.disabled', {});
      return { status: 'skipped_disabled' };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const lock = await acquireSweepLock(queryRunner, this.logger);
      if (!lock) {
        return { status: 'skipped_concurrent' };
      }

      try {
        return await this.runSweepLocked(queryRunner, options);
      } finally {
        await lock.release();
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async runSweepLocked(queryRunner: QueryRunner, options: SweepOptions): Promise<SweepResult> {
    const reclaimedStaleCount = await reclaimStaleDownloading(queryRunner, this.config.downloadStaleMinutes);
    if (reclaimedStaleCount > 0) {
      this.logEvent('PropertySalesDownload.reclaimedStale', { reclaimedStaleCount });
    }

    let forceResetCount = 0;
    if (options.force && options.sinceReleaseDate) {
      forceResetCount = await resetForForceRedownload(queryRunner, options.sinceReleaseDate);
      this.logEvent('PropertySalesDownload.forceReset', {
        sinceReleaseDate: options.sinceReleaseDate,
        forceResetCount,
      });
    }

    await mkdir(this.config.archivesDir, { recursive: true });
    const workspace = await this.archiveStore.createStagingWorkspace();

    const browser = await this.psiBrowser.launch();
    try {
      let candidates: readonly ArchiveCandidate[];
      try {
        const rawPage = await browser.newPage();
        const page = wrapPage(rawPage);
        candidates = await this.sourceDiscovery.discoverArchiveCandidates(page);
      } catch (err) {
        const described = describeError(err);
        this.logger.error(
          JSON.stringify({ context: 'PropertySalesDownload.discoveryFailed', ...described, ts: new Date().toISOString() }),
        );
        return { status: 'failed', errorCode: described.code, errorMessage: described.message, reclaimedStaleCount, forceResetCount };
      }

      const discoveredCount = candidates.length;

      let scoped = options.sinceReleaseDate
        ? candidates.filter((c) => c.releaseDate >= options.sinceReleaseDate!)
        : candidates;

      const forceWindow = Boolean(options.force && options.sinceReleaseDate);
      if (!forceWindow) {
        const statuses = await findStatusesByUrl(queryRunner, scoped.map((c) => c.url));
        scoped = scoped.filter((c) => {
          const status = statuses.get(c.url);
          return !status || !SKIP_STATUSES.has(status);
        });
      }

      // Discovery returns newest-first; catch-up should progress chronologically.
      const oldestFirst = [...scoped].reverse();
      const maxArchives = options.maxArchives ?? this.config.maxArchivesPerRun;
      const considered = oldestFirst.slice(0, maxArchives);

      this.logEvent('PropertySalesDownload.sweepScoped', {
        discoveredCount,
        consideredCount: considered.length,
        dryRun: Boolean(options.dryRun),
      });

      if (options.dryRun) {
        return {
          status: 'completed',
          discoveredCount,
          consideredCount: considered.length,
          outcomes: [],
          reclaimedStaleCount,
          forceResetCount,
        };
      }

      const outcomes: SweepArchiveOutcome[] = [];
      let abortedReason: 'insufficient_disk' | undefined;

      for (const candidate of considered) {
        if (!(await this.hasEnoughFreeDisk())) {
          abortedReason = 'insufficient_disk';
          break;
        }

        const filename = basenameOfUrl(candidate.url);
        const claimed = await claimForDownload(queryRunner, {
          sourceUrl: candidate.url,
          archiveFilename: filename,
          releaseDate: candidate.releaseDate,
        });

        if (!claimed) {
          outcomes.push({
            sourceUrl: candidate.url,
            releaseDate: candidate.releaseDate,
            status: 'skipped_claimed_elsewhere',
          });
          continue;
        }

        const stagingDestination = join(workspace.stagingDir, filename);
        try {
          const result = await downloadViaBrowser(browser, candidate.url, stagingDestination, {
            timeoutMs: this.config.downloadTimeoutMs,
            maxBytes: this.config.maxArchiveBytes,
          });

          const finalPath = join(this.config.archivesDir, `${candidate.releaseDate}-${filename}`);
          await rename(stagingDestination, finalPath);

          await markDownloaded(queryRunner, claimed.id, {
            localPath: finalPath,
            sizeBytes: result.bytes,
            sha256: result.sha256,
            entryCount: result.entryCount,
          });

          outcomes.push({ sourceUrl: candidate.url, releaseDate: candidate.releaseDate, status: 'downloaded' });
          this.logEvent('PropertySalesDownload.downloaded', {
            url: candidate.url,
            releaseDate: candidate.releaseDate,
            bytes: result.bytes,
            entryCount: result.entryCount,
          });
        } catch (err) {
          const described = describeError(err);
          const giveUp = claimed.attemptCount >= MAX_ATTEMPTS_BEFORE_QUARANTINE;

          if (giveUp) {
            await markQuarantined(queryRunner, claimed.id, described.code, described.message);
            outcomes.push({
              sourceUrl: candidate.url,
              releaseDate: candidate.releaseDate,
              status: 'quarantined',
              errorCode: described.code,
              errorMessage: described.message,
            });
            this.logger.error(
              JSON.stringify({
                context: 'PropertySalesDownload.quarantined',
                url: candidate.url,
                attemptCount: claimed.attemptCount,
                ...described,
                ts: new Date().toISOString(),
              }),
            );
          } else {
            await markDownloadFailed(queryRunner, claimed.id, described.code, described.message);
            outcomes.push({
              sourceUrl: candidate.url,
              releaseDate: candidate.releaseDate,
              status: 'download_failed',
              errorCode: described.code,
              errorMessage: described.message,
            });
            this.logger.warn(
              JSON.stringify({
                context: 'PropertySalesDownload.downloadFailed',
                url: candidate.url,
                attemptCount: claimed.attemptCount,
                ...described,
                ts: new Date().toISOString(),
              }),
            );
          }
          // One bad week must not block the rest of the catch-up.
        }
      }

      this.logEvent('PropertySalesDownload.sweepComplete', {
        discoveredCount,
        consideredCount: considered.length,
        outcomeCount: outcomes.length,
        abortedReason,
      });

      return {
        status: 'completed',
        discoveredCount,
        consideredCount: considered.length,
        outcomes,
        reclaimedStaleCount,
        forceResetCount,
        ...(abortedReason ? { abortedReason } : {}),
      };
    } finally {
      await browser.close().catch(() => undefined);
      await this.archiveStore.deleteStagingWorkspace(workspace.stagingDir).catch((err: unknown) => {
        this.logger.warn(
          JSON.stringify({
            context: 'PropertySalesDownload.stagingCleanupFailed',
            reason: err instanceof Error ? err.message : String(err),
            ts: new Date().toISOString(),
          }),
        );
      });
    }
  }
}
