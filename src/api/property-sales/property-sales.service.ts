/**
 * Sequences one ingestion sweep end to end, matching the five-box pipeline
 * agreed with the team: cron trigger -> read the DB for the latest data ->
 * download via puppeteer -> unzip -> parse the .dat (including filtering).
 * Deliberately stops there — nothing here reads or writes
 * `property_sales_raw` beyond the one watermark SELECT below; KAN-242 adds
 * the INSERT.
 *
 * No ledger, no queue, no retention: a downloaded archive lives in one
 * sweep's own OS temp directory and is removed when the sweep finishes,
 * whether it succeeded or not. One archive's failure is logged and skipped;
 * it never aborts the rest of the sweep. Concurrency is a single in-process
 * flag — this app runs as one container per environment, so an advisory
 * database lock would be solving a problem that does not exist here.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Browser as PuppeteerBrowser } from 'puppeteer';
import type { DataSource } from 'typeorm';

import { extractDatFiles } from './archive-extractor';
import {
  type ArchiveCandidate,
  assertAllowedDownloadUrl,
  downloadViaBrowser,
  PsiBrowserService,
  SourceDiscoveryService,
  wrapPage,
} from './discovery-and-download';
import {
  applySaleFilters,
  groupBySaleKey,
  mapSaleRow,
  parseDatFile,
  type RejectedRecord,
  saleKey,
  type SaleRow,
} from './dat-parser';
import { describeError, type PropertySalesErrorCode } from './exceptions';
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

  /**
   * Box 2: "read the DB to figure out what is the latest data". Every B
   * record in a weekly archive carries a `download_datetime` equal to that
   * archive's own release date (at 01:00), so `MAX(download_datetime)` is an
   * exact watermark — any candidate whose release date is strictly newer is
   * guaranteed not yet loaded.
   *
   * `property_sales_raw` is not TypeORM-managed — it is created out-of-band
   * by comparable-sales-data/schema-creation.sql and appears in none of this
   * repo's migrations (the same thing comparables.service.ts's boot-time
   * schema introspection already has to work around) — so this is a raw
   * query via the injected DataSource, not a repository.
   *
   * Returns `null` when the table doesn't exist yet (a fresh environment) or
   * is empty — callers must treat that as "no watermark" and take the
   * oldest candidates, not as an error.
   */
  private async readLatestSaleWatermark(): Promise<Date | null> {
    const [{ to_regclass: tableExists }] = await this.dataSource.query<
      [{ to_regclass: string | null }]
    >(`SELECT to_regclass('public.property_sales_raw') AS to_regclass`);
    if (tableExists === null) {
      return null;
    }

    const [{ watermark }] = await this.dataSource.query<
      [{ watermark: Date | null }]
    >(`SELECT MAX(download_datetime) AS watermark FROM property_sales_raw`);
    return watermark;
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
    // Box 2: read the DB for the latest data already held, before anything
    // else — cheap, and lets a DB problem surface before Puppeteer launches.
    const watermark = await this.readLatestSaleWatermark();
    this.logEvent('PropertySales.watermark', {
      watermark: watermark?.toISOString() ?? null,
    });

    const sweepTempDir = await mkdtemp(join(tmpdir(), 'psi-'));
    try {
      return await this.runSweep(watermark, options, sweepTempDir);
    } finally {
      await rm(sweepTempDir, { recursive: true, force: true });
    }
  }

  private async runSweep(
    watermark: Date | null,
    options: SweepOptions,
    sweepTempDir: string,
  ): Promise<SweepResult> {
    // Box 3 (discovery half): find every advertised weekly candidate.
    const browser = await this.psiBrowser.launch();
    try {
      let candidates: readonly ArchiveCandidate[];
      try {
        const rawPage = await browser.newPage();
        candidates = await this.sourceDiscovery.discoverArchiveCandidates(
          wrapPage(rawPage),
        );
      } catch (err) {
        const described = describeError(err);
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

      // Only candidates released after the watermark are new; a null
      // watermark (fresh environment, or table not created yet) means take
      // the oldest ones first rather than fail the sweep.
      const scoped =
        watermark === null
          ? candidates
          : candidates.filter((c) => new Date(c.releaseDate) > watermark);

      // Discovery returns newest-first; catch-up should progress chronologically.
      const oldestFirst = [...scoped].reverse();
      const maxArchives = options.maxArchives ?? this.config.maxArchivesPerRun;
      const considered = oldestFirst.slice(0, maxArchives);

      this.logEvent('PropertySales.sweepScoped', {
        discoveredCount,
        consideredCount: considered.length,
      });

      const archives: ArchiveIngestOutcome[] = [];
      for (const [index, candidate] of considered.entries()) {
        archives.push(
          await this.ingestOneArchive(browser, candidate, sweepTempDir, index),
        );
      }

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

  /**
   * Boxes 3 (download) -> 4 (unzip) -> 5 (parse, including filtering) for
   * one candidate. Never throws — any failure is caught and returned as a
   * 'failed' outcome so it cannot abort the rest of the sweep.
   */
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

      // Discovery already pre-filtered by host allowlist; re-checking here
      // means the actual fetch never happens against an unvalidated URL,
      // even if a caller ever invokes ingestOneArchive some other way.
      assertAllowedDownloadUrl(candidate.url, this.config.allowedDownloadHosts);

      // Box 3: download via puppeteer.
      const destPath = join(archiveDir, archiveFilename);
      await downloadViaBrowser(browser, candidate.url, destPath, {
        timeoutMs: this.config.downloadTimeoutMs,
        maxBytes: this.config.maxArchiveBytes,
      });

      // Box 4: unzip (.dat entries only).
      const extractDir = join(archiveDir, 'extracted');
      const extraction = await extractDatFiles(
        destPath,
        extractDir,
        this.config.archiveLimits,
      );

      // Box 5: parse the .dat file(s), including filtering.
      const rows: SaleRow[] = [];
      const rejections: RejectedRecord[] = [];
      for (const file of extraction.files) {
        const parsed = await parseDatFile(file.path, file.relativePath);
        const ownershipsByKey = groupBySaleKey(parsed.ownerships);
        for (const sale of parsed.sales) {
          const outcome = mapSaleRow(
            sale,
            ownershipsByKey.get(saleKey(sale)) ?? [],
          );
          if (outcome.row) {
            rows.push(outcome.row);
          } else {
            rejections.push(...outcome.rejections);
          }
        }
      }

      const { included, excludedCount } = applySaleFilters(rows, this.config);

      this.logEvent('PropertySales.parsed', {
        archiveFilename,
        releaseDate: candidate.releaseDate,
        datFileCount: extraction.files.length,
        saleRowCount: rows.length,
        excludedCount,
        rejectedCount: rejections.length,
      });

      // KAN-242 plugs in here: insert `included` into property_sales_raw,
      // then the watermark advances on its own next sweep. Until then,
      // nothing here writes to the database, so a re-run will re-discover
      // and re-parse the same archives — harmless while the feature is
      // disabled by default, and documented in the README.
      return {
        sourceUrl: candidate.url,
        archiveFilename,
        releaseDate: candidate.releaseDate,
        status: 'parsed',
        datFileCount: extraction.files.length,
        saleRowCount: rows.length,
        excludedCount,
        rejectedCount: rejections.length,
        rows: included,
      };
    } catch (err) {
      const described = describeError(err);
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
