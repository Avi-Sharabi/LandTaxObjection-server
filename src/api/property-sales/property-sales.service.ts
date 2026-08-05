import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Browser as PuppeteerBrowser } from 'puppeteer';
import type { DataSource } from 'typeorm';

import {
  assertAllowedDownloadUrl,
  downloadViaBrowser,
} from './archive-download';
import { extractDatFiles } from './archive-extractor';
import {
  type ArchiveCandidate,
  selectArchivesToIngest,
} from './archive-selection.util';
import { applySaleFilters, parseDatFile, type SaleRow } from './dat-parser';
import { PsiBrowserService } from './psi-browser.service';
import { SourceDiscoveryService, wrapPage } from './source-discovery.service';
import { describePropertySalesError } from './exceptions/describe-property-sales-error';
import type { PropertySalesErrorCode } from './exceptions/property-sales.exception';
import { PropertySalesConfig } from './property-sales.config';

export interface ArchiveIngestOutcome {
  readonly sourceUrl: string;
  readonly archiveFilename: string;
  readonly releaseDate: string;
  readonly status: 'parsed' | 'failed';
  readonly datFileCount?: number;
  readonly saleRowCount?: number;
  readonly excludedCount?: number;
  readonly rejectedCount?: number;
  readonly rows?: readonly SaleRow[];
  readonly errorCode?: PropertySalesErrorCode;
  readonly errorMessage?: string;
}

export type SweepStatus =
  | 'completed'
  | 'skipped_disabled'
  | 'skipped_concurrent'
  | 'failed';

export interface SweepOptions {
  readonly maxArchives?: number;
}

export interface SweepResult {
  readonly status: SweepStatus;
  readonly discoveredCount?: number;
  readonly consideredCount?: number;
  readonly archives?: readonly ArchiveIngestOutcome[];
  readonly errorCode?: PropertySalesErrorCode;
  readonly errorMessage?: string;
}

function basenameOfUrl(url: string): string {
  const pathname = new URL(url).pathname;
  return pathname.split('/').filter(Boolean).pop() ?? 'archive.zip';
}

@Injectable()
export class PropertySalesService {
  private readonly logger = new Logger(PropertySalesService.name);
  private isRunning = false;

  constructor(
    private readonly config: PropertySalesConfig,
    private readonly psiBrowser: PsiBrowserService,
    private readonly sourceDiscovery: SourceDiscoveryService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private logEvent(context: string, data: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({ context, ...data, ts: new Date().toISOString() }),
    );
  }

  private async readLoadedReleaseDates(): Promise<ReadonlySet<string>> {
    const [{ to_regclass: tableExists }] = await this.dataSource.query<
      [{ to_regclass: string | null }]
    >(`SELECT to_regclass('public.property_sales_raw') AS to_regclass`);
    if (tableExists === null) {
      return new Set();
    }

    const rows = await this.dataSource.query<{ release_date: string }[]>(
      `SELECT DISTINCT to_char(
         (download_datetime AT TIME ZONE 'Australia/Sydney')::date,
         'YYYY-MM-DD'
       ) AS release_date
       FROM property_sales_raw
       WHERE download_datetime IS NOT NULL`,
    );
    return new Set(rows.map((row) => row.release_date));
  }

  async run(options: SweepOptions = {}): Promise<SweepResult> {
    if (!this.config.enabled) {
      this.logEvent('PropertySales.disabled', {});
      return { status: 'skipped_disabled' };
    }

    if (this.isRunning) {
      this.logEvent('PropertySales.skippedConcurrent', {});
      return { status: 'skipped_concurrent' };
    }

    this.isRunning = true;
    try {
      return await this.runLocked(options);
    } finally {
      this.isRunning = false;
    }
  }

  private async runLocked(options: SweepOptions): Promise<SweepResult> {
    const loadedReleaseDates = await this.readLoadedReleaseDates();
    this.logEvent('PropertySales.alreadyLoaded', {
      loadedCount: loadedReleaseDates.size,
      newestLoaded: [...loadedReleaseDates].sort().pop() ?? null,
    });

    const sweepTempDir = await mkdtemp(join(tmpdir(), 'psi-'));
    try {
      return await this.runSweep(loadedReleaseDates, options, sweepTempDir);
    } finally {
      await rm(sweepTempDir, { recursive: true, force: true });
    }
  }

  private async runSweep(
    loadedReleaseDates: ReadonlySet<string>,
    options: SweepOptions,
    sweepTempDir: string,
  ): Promise<SweepResult> {
    const browser = await this.psiBrowser.launch();
    try {
      let candidates: readonly ArchiveCandidate[];
      try {
        const rawPage = await browser.newPage();
        candidates = await this.sourceDiscovery.discoverArchiveCandidates(
          wrapPage(rawPage),
        );
      } catch (err) {
        const described = describePropertySalesError(err);
        this.logger.error(
          JSON.stringify({
            context: 'PropertySales.discoveryFailed',
            errorCode: described.code,
            errorMessage: described.message,
            ...(described.context ? { errorContext: described.context } : {}),
            ts: new Date().toISOString(),
          }),
        );
        return {
          status: 'failed',
          errorCode: described.code,
          errorMessage: described.message,
        };
      }

      const discoveredCount = candidates.length;

      const maxArchives = options.maxArchives ?? this.config.maxArchivesPerRun;
      const considered = selectArchivesToIngest(
        candidates,
        loadedReleaseDates,
        maxArchives,
      );

      this.logEvent('PropertySales.sweepScoped', {
        discoveredCount,
        alreadyLoadedCount: loadedReleaseDates.size,
        consideredCount: considered.length,
        considering: considered.map((c) => c.releaseDate),
      });

      const archives: ArchiveIngestOutcome[] = [];
      for (const [index, candidate] of considered.entries()) {
        archives.push(
          await this.ingestOneArchive(browser, candidate, sweepTempDir, index),
        );
      }

      this.logEvent('PropertySales.sweepTotals', {
        archiveCount: archives.length,
        parsedCount: archives.filter((a) => a.status === 'parsed').length,
        failedCount: archives.filter((a) => a.status === 'failed').length,
        totalSaleRows: archives.reduce((n, a) => n + (a.saleRowCount ?? 0), 0),
        totalExcluded: archives.reduce((n, a) => n + (a.excludedCount ?? 0), 0),
        totalRejected: archives.reduce((n, a) => n + (a.rejectedCount ?? 0), 0),
      });

      return {
        status: 'completed',
        discoveredCount,
        consideredCount: considered.length,
        archives,
      };
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  private async ingestOneArchive(
    browser: PuppeteerBrowser,
    candidate: ArchiveCandidate,
    sweepTempDir: string,
    index: number,
  ): Promise<ArchiveIngestOutcome> {
    const archiveFilename = basenameOfUrl(candidate.url);
    const archiveDir = join(sweepTempDir, String(index).padStart(3, '0'));

    try {
      await mkdir(archiveDir, { recursive: true });

      assertAllowedDownloadUrl(candidate.url, this.config.allowedDownloadHosts);

      const destPath = join(archiveDir, archiveFilename);
      await downloadViaBrowser(browser, candidate.url, destPath, {
        navigationTimeoutMs: this.config.browserTimeoutMs,
        timeoutMs: this.config.downloadTimeoutMs,
        maxBytes: this.config.maxArchiveBytes,
      });

      const extractDir = join(archiveDir, 'extracted');
      const extraction = await extractDatFiles(
        destPath,
        extractDir,
        this.config.archiveLimits,
      );

      const rows: SaleRow[] = [];
      let rejectedCount = 0;
      for (const file of extraction.files) {
        const parsed = await parseDatFile(file.path, file.relativePath);
        rows.push(...parsed.rows);
        rejectedCount += parsed.rejectedCount;
      }

      const { included, excludedCount } = applySaleFilters(rows, this.config);

      this.logEvent('PropertySales.parsed', {
        archiveFilename,
        releaseDate: candidate.releaseDate,
        datFileCount: extraction.files.length,
        saleRowCount: rows.length,
        excludedCount,
        rejectedCount,
        includedCount: included.length,
      });

      // KAN-241 stops before any database write, so a bounded sample is the
      // only way to see that fields mapped correctly. KAN-242 inserts `rows`.
      if (this.config.logSampleRows > 0) {
        this.logEvent('PropertySales.sampleRows', {
          archiveFilename,
          releaseDate: candidate.releaseDate,
          sampleSize: Math.min(this.config.logSampleRows, included.length),
          ofTotal: included.length,
          sample: included.slice(0, this.config.logSampleRows),
        });
      }

      return {
        sourceUrl: candidate.url,
        archiveFilename,
        releaseDate: candidate.releaseDate,
        status: 'parsed',
        datFileCount: extraction.files.length,
        saleRowCount: rows.length,
        excludedCount,
        rejectedCount,
        rows: included,
      };
    } catch (err) {
      const described = describePropertySalesError(err);
      this.logger.error(
        JSON.stringify({
          context: 'PropertySales.archiveFailed',
          archiveFilename,
          sourceUrl: candidate.url,
          errorCode: described.code,
          errorMessage: described.message,
          ...(described.context ? { errorContext: described.context } : {}),
          ts: new Date().toISOString(),
        }),
      );
      return {
        sourceUrl: candidate.url,
        archiveFilename,
        releaseDate: candidate.releaseDate,
        status: 'failed',
        errorCode: described.code,
        errorMessage: described.message,
      };
    }
  }
}
