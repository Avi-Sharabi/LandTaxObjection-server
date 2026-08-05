import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { openDownloadSession } from './archive-download';
import {
  ingestOneArchive,
  type ArchiveIngestOutcome,
} from './archive-ingestion';
import {
  type ArchiveCandidate,
  selectArchivesToIngest,
} from './archive-selection.util';
import { PsiBrowserService } from './psi-browser.service';
import { SourceDiscoveryService, wrapPage } from './source-discovery.service';
import { describePropertySalesError } from './exceptions/describe-property-sales-error';
import type { PropertySalesErrorCode } from './exceptions/property-sales.exception';
import { logDescribedError, logEvent } from './property-sales-log.util';
import { TMP_ROOT } from './property-sales.constants';
import { PropertySalesRepository } from './property-sales.repository';

const MAX_ARCHIVES_PER_RUN = 5;

export type ArchiveSyncStatus = 'completed' | 'skipped_concurrent' | 'failed';

export interface ArchiveSyncOptions {
  readonly maxArchives?: number;
}

/**
 * One end-to-end run: discover candidates, select which to ingest, download +
 * extract + parse + filter each one, aggregate results. "Sync" is
 * one-directional here — this never writes back to the NSW source, only
 * reads from it.
 */
export interface ArchiveSyncResult {
  readonly status: ArchiveSyncStatus;
  readonly discoveredCount?: number;
  readonly consideredCount?: number;
  readonly archives?: readonly ArchiveIngestOutcome[];
  readonly errorCode?: PropertySalesErrorCode;
  readonly errorMessage?: string;
}

@Injectable()
export class PropertySalesService implements OnModuleInit {
  private readonly logger = new Logger(PropertySalesService.name);
  private isRunning = false;

  constructor(
    private readonly repository: PropertySalesRepository,
    private readonly psiBrowser: PsiBrowserService,
    private readonly sourceDiscovery: SourceDiscoveryService,
  ) {}

  /**
   * Best-effort wipe of TMP_ROOT at boot. A project-relative scratch
   * directory (unlike some ephemeral /tmp setups) can persist across app
   * restarts within the same container's lifetime, so a crash mid-sync
   * could otherwise leave orphaned psi-* directories accumulating
   * indefinitely. Not correctness-critical — swallow errors rather than
   * fail boot over stale scratch files.
   */
  async onModuleInit(): Promise<void> {
    await rm(TMP_ROOT, { recursive: true, force: true }).catch(
      (err: unknown) => {
        this.logger.warn(
          `[PSI] Failed to clear stale TMP_ROOT at boot — ${err instanceof Error ? err.message : String(err)}`,
        );
      },
    );
  }

  async run(options: ArchiveSyncOptions = {}): Promise<ArchiveSyncResult> {
    if (this.isRunning) {
      logEvent(this.logger, 'PropertySales.skippedConcurrent', {});
      return { status: 'skipped_concurrent' };
    }

    this.isRunning = true;
    try {
      return await this.runLocked(options);
    } finally {
      this.isRunning = false;
    }
  }

  private async runLocked(
    options: ArchiveSyncOptions,
  ): Promise<ArchiveSyncResult> {
    const loadedReleaseDates = await this.repository.readLoadedReleaseDates();
    logEvent(this.logger, 'PropertySales.alreadyLoaded', {
      loadedCount: loadedReleaseDates.size,
      newestLoaded: [...loadedReleaseDates].sort().pop() ?? null,
    });

    await mkdir(TMP_ROOT, { recursive: true });
    const syncTempDir = await mkdtemp(join(TMP_ROOT, 'psi-'));
    try {
      return await this.runArchiveSync(
        loadedReleaseDates,
        options,
        syncTempDir,
      );
    } finally {
      await rm(syncTempDir, { recursive: true, force: true });
    }
  }

  private async runArchiveSync(
    loadedReleaseDates: ReadonlySet<string>,
    options: ArchiveSyncOptions,
    syncTempDir: string,
  ): Promise<ArchiveSyncResult> {
    const browser = await this.psiBrowser.launch();
    // One page for the whole archive sync — discovery and every archive
    // download reuse it, instead of opening/closing a page per archive. Also
    // lets any Cloudflare-clearance cookies picked up during discovery carry
    // over to the downloads.
    const page = await browser.newPage();
    try {
      let candidates: readonly ArchiveCandidate[];
      try {
        candidates = await this.sourceDiscovery.discoverArchiveCandidates(
          wrapPage(page),
        );
      } catch (err) {
        const described = describePropertySalesError(err);
        logDescribedError(
          this.logger,
          'PropertySales.discoveryFailed',
          described,
        );
        return {
          status: 'failed',
          errorCode: described.code,
          errorMessage: described.message,
        };
      }

      const discoveredCount = candidates.length;

      const maxArchives = options.maxArchives ?? MAX_ARCHIVES_PER_RUN;
      const considered = selectArchivesToIngest(
        candidates,
        loadedReleaseDates,
        maxArchives,
      );

      logEvent(this.logger, 'PropertySales.archiveSyncScoped', {
        discoveredCount,
        alreadyLoadedCount: loadedReleaseDates.size,
        consideredCount: considered.length,
        considering: considered.map((c) => c.releaseDate),
      });

      const archives: ArchiveIngestOutcome[] = [];
      const session = await openDownloadSession(browser, page);
      try {
        for (const [index, candidate] of considered.entries()) {
          archives.push(
            await ingestOneArchive(session, candidate, syncTempDir, index),
          );
        }
      } finally {
        await session.close();
      }

      const totals = archives.reduce(
        (acc, archive) => {
          if (archive.status === 'parsed') acc.parsedCount += 1;
          else acc.failedCount += 1;
          acc.totalSaleRows += archive.saleRowCount ?? 0;
          acc.totalExcluded += archive.excludedCount ?? 0;
          acc.totalRejected += archive.rejectedCount ?? 0;
          return acc;
        },
        {
          parsedCount: 0,
          failedCount: 0,
          totalSaleRows: 0,
          totalExcluded: 0,
          totalRejected: 0,
        },
      );
      logEvent(this.logger, 'PropertySales.archiveSyncTotals', {
        archiveCount: archives.length,
        ...totals,
      });

      return {
        status: 'completed',
        discoveredCount,
        consideredCount: considered.length,
        archives,
      };
    } finally {
      await page.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  }
}
