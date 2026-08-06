import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import type { Browser, Page } from 'puppeteer';

import { PuppeteerService } from '../supporting-evidence/shared/puppeteer.service';
import { PsiArchiveService } from './psi-archive.service';
import { PsiDatParserService } from './psi-dat-parser.service';
import { PsiDownloadService } from './psi-download.service';
import { PsiImportRepository } from './psi-import.repository';
import { PsiScraperService } from './psi-scraper.service';
import {
  PSI_DOWNLOAD_ROOT,
  PSI_LOG_TAG,
  PSI_USER_AGENT,
} from './psi-import.constant';
import {
  PsiSaleRecord,
  PsiWeekResult,
} from './types/psi-sale-record.interface';
import {
  PsiListingResult,
  PsiWeeklyLink,
} from './types/psi-weekly-link.interface';
import { formatPsiLabel } from './util/psi-date.util';

@Injectable()
export class PsiImportService {
  private readonly logger = new Logger(PsiImportService.name);

  constructor(
    private readonly repository: PsiImportRepository,
    private readonly puppeteerSvc: PuppeteerService,
    private readonly scraper: PsiScraperService,
    private readonly downloader: PsiDownloadService,
    private readonly archive: PsiArchiveService,
    private readonly parser: PsiDatParserService,
  ) {}

  /**
   * Runs the full pipeline: resolve the reference date from the database, find the weekly files
   * published since then, download and extract each, and parse the .DAT files.
   *
   * Nothing is written to `property_sales_raw` — parsed records are logged only. That is
   * deliberate for this iteration; the table feeds the live comparables pipeline, so the parse
   * gets eyeballed before it gets trusted.
   *
   * One browser is opened for the whole run and shared by the scrape and download steps. The
   * origin is behind Cloudflare, and only requests from the session that solved its challenge
   * are honoured — a fresh browser per download would have to re-clear each time.
   */
  async runImport(): Promise<PsiWeekResult[]> {
    const startedAt = Date.now();
    const referenceLabel = await this.resolveReferenceLabel();

    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      browser = await this.puppeteerSvc.launch();
      page = await browser.newPage();
      await page.setUserAgent(PSI_USER_AGENT);

      const listing = await this.scraper.findWeeklyDownloads(
        page,
        referenceLabel,
      );
      this.logListingSummary(listing);

      if (listing.links.length === 0) {
        this.logger.log(
          `${PSI_LOG_TAG} Already up to date — nothing to download`,
        );
        return [];
      }

      const results = await this.processWeeks(page, listing.links);
      this.logRunSummary(results, startedAt);
      return results;
    } finally {
      if (page) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * Weeks are handled one at a time, and a failure on one is logged and skipped rather than
   * aborting the run.
   *
   * Sequential by design: concurrency here would mean several archives in flight against a
   * government server, from a container already running Chromium under
   * `--js-flags=--max-old-space-size=512`.
   */
  private async processWeeks(
    page: Page,
    links: PsiWeeklyLink[],
  ): Promise<PsiWeekResult[]> {
    const results: PsiWeekResult[] = [];

    for (const link of links) {
      try {
        results.push(await this.processWeek(page, link));
      } catch (err) {
        this.logger.error(
          `${PSI_LOG_TAG} Week ${link.label} failed — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return results;
  }

  /**
   * Reads the latest `download_datetime` already imported and renders it in the site's own
   * `DD MMM YYYY` form. That string is the reference the scraper matches anchor labels against.
   */
  private async resolveReferenceLabel(): Promise<string | null> {
    const latest = await this.repository.findLatestDownloadDatetime();

    if (latest === null) {
      // On a populated production database this means something is wrong, not that we should
      // quietly backfill years of history — so say so rather than proceeding silently.
      this.logger.warn(
        `${PSI_LOG_TAG} property_sales_raw has no download_datetime — every weekly file on the page will be treated as new`,
      );
      return null;
    }

    const label = formatPsiLabel(latest);
    this.logger.log(
      `${PSI_LOG_TAG} Reference date: ${label} (from property_sales_raw.download_datetime)`,
    );
    return label;
  }

  private async processWeek(
    page: Page,
    link: PsiWeeklyLink,
  ): Promise<PsiWeekResult> {
    const runDir = join(PSI_DOWNLOAD_ROOT, link.fileStem);
    const zipPath = await this.downloader.downloadWeeklyArchive(
      page,
      link,
      runDir,
    );

    const { datFiles, nestedArchiveCount } =
      await this.archive.extractWeeklyArchive(zipPath, runDir);

    this.logger.log(
      `${PSI_LOG_TAG}   extracted ${nestedArchiveCount} archive(s) → ${datFiles.length} .DAT file(s)`,
    );

    if (datFiles.length === 0) {
      this.logger.warn(
        `${PSI_LOG_TAG}   No .DAT files found in ${link.label} — check the archive layout`,
      );
      return { link, zipPath, datFileCount: 0, recordCount: 0 };
    }

    // One raw dump per week so the positional field layout stays verifiable against real data.
    await this.parser.logSampleLines(datFiles[0]);

    // One file at a time: parse, hand off, drop. Nothing is retained across the loop, so peak
    // memory is a single district file (tens of records) no matter how many weeks are being
    // caught up — a 31-week backlog costs the same as a single week.
    let recordCount = 0;
    for (const datFile of datFiles) {
      const records = await this.parseFile(datFile);
      this.ingestRecords(records);
      recordCount += records.length;
    }

    return { link, zipPath, datFileCount: datFiles.length, recordCount };
  }

  /**
   * PLACEHOLDER — the hand-off point for the next task: writing one .DAT file's records into
   * `property_sales_raw`. For now it dumps them as JSON so the shape can be inspected.
   *
   * Called once per file rather than once per run, so this is already the right shape for a
   * batched insert: the caller drops each array as soon as this returns, keeping peak memory at
   * one district file regardless of how many weeks a catch-up covers. Keep it that way — going
   * back to a single end-of-run call would put ~100k records (~230 MB) on a heap capped at
   * `--js-flags=--max-old-space-size=512`, in a container that is also running Chromium.
   *
   * The `console.log` is the one thing that must go. Printing every record overruns the Docker
   * json-file driver's `max-size=10m` on the VM and rotates away the surrounding log lines —
   * fine for dev-time inspection, not for an unattended Monday run.
   */
  private ingestRecords(records: PsiSaleRecord[]): void {
    if (records.length === 0) return;

    console.log(JSON.stringify(records, null, 2));
  }

  /** Parses one .DAT file, logging its counts and returning the mapped sale records. */
  private async parseFile(datFile: string): Promise<PsiSaleRecord[]> {
    const parsed = await this.parser.parseFile(datFile);

    const malformedNote =
      parsed.malformedLines > 0 ? `, ${parsed.malformedLines} malformed` : '';
    this.logger.log(
      `${PSI_LOG_TAG}   ${parsed.sourceFile} — ${parsed.records.length} sale record(s), ${parsed.skippedRecords} non-B skipped${malformedNote}`,
    );

    return parsed.records;
  }

  private logListingSummary(listing: PsiListingResult): void {
    this.logger.log(
      `${PSI_LOG_TAG} Listing returned ${listing.totalAnchors} weekly link(s); ${listing.links.length} newer than reference`,
    );
    for (const link of listing.links) {
      this.logger.log(`${PSI_LOG_TAG}   queued ${link.label} — ${link.url}`);
    }
  }

  private logRunSummary(results: PsiWeekResult[], startedAt: number): void {
    const files = results.reduce((total, week) => total + week.datFileCount, 0);
    const records = results.reduce(
      (total, week) => total + week.recordCount,
      0,
    );
    const seconds = Math.round((Date.now() - startedAt) / 1000);

    this.logger.log(
      `${PSI_LOG_TAG} Run complete — ${results.length} week(s), ${files} file(s), ${records.toLocaleString('en-AU')} record(s) in ${seconds}s`,
    );
  }
}
