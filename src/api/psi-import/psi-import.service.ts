import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { rm } from 'fs/promises';
import { join } from 'path';
import type { Browser, Page } from 'puppeteer';
import { DataSource } from 'typeorm';

import { PuppeteerService } from '../supporting-evidence/shared/puppeteer.service';
import { PropertySalesRaw } from './entities/property-sales-raw.entity';
import { PsiWeekUnusableException } from './exceptions/psi-week-unusable.exception';
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
  PsiParsedFile,
  PsiWeekCounts,
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
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly repository: PsiImportRepository,
    private readonly puppeteerSvc: PuppeteerService,
    private readonly scraper: PsiScraperService,
    private readonly downloader: PsiDownloadService,
    private readonly archive: PsiArchiveService,
    private readonly parser: PsiDatParserService,
  ) {}

  /**
   * Resolves the reference date from the database, finds the weekly files published since then,
   * then downloads, extracts, parses and inserts each into `property_sales_raw`.
   *
   * One browser is opened for the whole run and shared by the scrape and download steps. The
   * origin is behind Cloudflare, and only requests from the session that solved its challenge
   * are honoured — a fresh browser per download would have to re-clear each time.
   *
   * @param runId ties every log line to one run; the task passes its Redis lock token.
   */
  async runImport(runId: string): Promise<PsiWeekResult[]> {
    const startedAt = Date.now();

    await this.sweepDownloadRoot();

    const referenceLabel = await this.resolveReferenceLabel();

    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      // launchForPdf, not launch(): the shared launcher passes --single-process, which detaches the
      // frame mid-navigation on this Cloudflare-fronted origin.
      browser = await this.puppeteerSvc.launchForPdf();
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
        // Summarised anyway, so one PSI.run.done per tick and a gap means a run died.
        this.logRunSummary(runId, [], startedAt);
        return [];
      }

      const results = await this.processWeeks(runId, page, listing.links);
      this.logRunSummary(runId, results, startedAt);
      return results;
    } finally {
      if (page) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * Works oldest-first and stops at the first failure. Both halves are load-bearing.
   *
   * The resume marker is `MAX(download_datetime)` — a scalar watermark that cannot tell whether
   * the weeks below it were ever inserted. It is only correct if it advances over a *contiguous*
   * committed prefix. Newest-first would have a committed 24 Aug assert that a still-pending
   * 17 Aug is done; continuing past a failure would have the same effect one week later. Either
   * way that week is never offered again and is lost silently.
   *
   * Sequential by design: concurrency here would mean several archives in flight against a
   * government server, from a container that is also running Chromium.
   */
  private async processWeeks(
    runId: string,
    page: Page,
    links: PsiWeeklyLink[],
  ): Promise<PsiWeekResult[]> {
    const results: PsiWeekResult[] = [];

    for (const link of [...links].reverse()) {
      const weekStartedAt = Date.now();
      let result: PsiWeekResult;

      try {
        result = {
          link,
          ...(await this.processWeek(page, link)),
          status: 'success',
          durationMs: Date.now() - weekStartedAt,
          error: null,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `${PSI_LOG_TAG} Week ${link.label} failed — ${message}`,
        );
        result = {
          link,
          datFileCount: 0,
          recordCount: 0,
          malformedLines: 0,
          skippedRecords: 0,
          suppressedRows: 0,
          unmappedAreaType: 0,
          status: 'failed',
          durationMs: Date.now() - weekStartedAt,
          error: message,
        };
      }

      this.logWeekOutcome(runId, result);
      results.push(result);

      if (result.status === 'failed') {
        this.logger.warn(
          `${PSI_LOG_TAG} Stopping after ${link.label} — later weeks stay pending so the reference date does not skip this one`,
        );
        break;
      }
    }

    return results;
  }

  /**
   * Clears `psi-downloads/` before a run starts.
   *
   * Each week deletes its own directory in a `finally`, which covers every path the process
   * survives — but `main.ts` builds the app without `enableShutdownHooks()`, so the SIGTERM that
   * replaces the container on deploy never unwinds that frame, and SIGKILL/OOM never would. A
   * sweep on the way in covers all of them and needs no state.
   */
  private async sweepDownloadRoot(): Promise<void> {
    try {
      await rm(PSI_DOWNLOAD_ROOT, { recursive: true, force: true });
    } catch (err) {
      this.logger.warn(
        `${PSI_LOG_TAG} Could not clear ${PSI_DOWNLOAD_ROOT} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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

  /**
   * Downloads, extracts, parses and inserts one week, then deletes what it wrote to disk.
   *
   * The `finally` runs on the failure path too: a failed week's insert rolled back, so the archive
   * is worthless, and keeping it would mean trusting it — `downloadWeeklyArchive`'s
   * "already downloaded" check is a bare `stat().isFile()` with no integrity validation.
   */
  private async processWeek(
    page: Page,
    link: PsiWeeklyLink,
  ): Promise<PsiWeekCounts> {
    const runDir = join(PSI_DOWNLOAD_ROOT, link.fileStem);

    try {
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
        return {
          datFileCount: 0,
          recordCount: 0,
          malformedLines: 0,
          skippedRecords: 0,
          suppressedRows: 0,
          unmappedAreaType: 0,
        };
      }

      // One raw dump per week so the positional field layout stays verifiable against real data.
      await this.parser.logSampleLines(datFiles[0]);

      return {
        datFileCount: datFiles.length,
        ...(await this.ingestWeek(link, datFiles)),
      };
    } finally {
      // Swallowed so a cleanup failure cannot mask the real error; the start-of-run sweep
      // collects whatever is left behind.
      await rm(runDir, { recursive: true, force: true }).catch(
        (err: unknown) => {
          this.logger.warn(
            `${PSI_LOG_TAG}   Could not delete ${runDir} — ${err instanceof Error ? err.message : String(err)}`,
          );
        },
      );
    }
  }

  /**
   * Parses and inserts one week's .DAT files in a single transaction.
   *
   * All-or-nothing is what keeps the resume marker honest. A bundle's records do NOT share one
   * `download_datetime` — the 03 Aug 2026 bundle carries 13 distinct stamps, 01:00 through 01:12,
   * one per batch of district files — but they do share a calendar date, and the marker is rendered
   * down to `DD MMM YYYY`. So a half-inserted week still moves the marker onto that week's own label
   * and the district files that never landed would never be offered again. The loop also tracks the
   * newest stamp for `assertWeekStamp`, which is checked once the week is otherwise known good.
   *
   * Download and extraction run before this, not inside it — they are network-bound and would
   * otherwise pin a pooled connection for minutes. Parse-and-insert is seconds.
   *
   * One file at a time: parse, insert, drop. Peak memory is a single district file however deep
   * the backlog; accumulating a long catch-up first would put ~100k records (~230 MB) in the Node
   * heap, in a container that is also running Chromium.
   */
  private async ingestWeek(
    link: PsiWeeklyLink,
    datFiles: string[],
  ): Promise<Omit<PsiWeekCounts, 'datFileCount'>> {
    // One stamp per week, so the rows that arrived together stay identifiable afterwards.
    const importedAt = new Date();

    let recordCount = 0;
    let malformedLines = 0;
    let skippedRecords = 0;
    let suppressedRows = 0;
    let unmappedAreaType = 0;
    let latestStamp: number | null = null;

    await this.dataSource.transaction(async (manager) => {
      // Taken off the transactional manager, so the repository carries that manager's connection
      // and every file's write lands inside this BEGIN. The injected repository would not.
      const salesRepo = manager.getRepository(PropertySalesRaw);

      for (const datFile of datFiles) {
        const parsed = await this.parseAndLogFile(datFile);

        for (const record of parsed.records) {
          const time = record.download_datetime?.getTime();
          if (
            time !== undefined &&
            (latestStamp === null || time > latestStamp)
          ) {
            latestStamp = time;
          }
        }

        const outcome = await this.repository.insertSaleRecords(
          salesRepo,
          parsed.records,
          importedAt,
        );

        recordCount += outcome.inserted;
        suppressedRows += outcome.suppressed;
        unmappedAreaType += outcome.unmappedAreaType;
        malformedLines += parsed.malformedLines;
        skippedRecords += parsed.skippedRecords;
      }

      // Nothing written at all means either the B layout moved and every line was rejected, or the
      // whole week collided with rows already present. Committing that would advance the reference
      // date over a week that stored nothing, so fail instead and leave it pending.
      if (recordCount === 0) {
        throw new PsiWeekUnusableException(
          link.label,
          `${datFiles.length} .DAT file(s) stored no sale records (${malformedLines} malformed, ${skippedRecords} non-B, ${suppressedRows} rejected by uq_psr_dealing_number)`,
        );
      }

      this.assertWeekStamp(link, latestStamp);
    });

    return {
      recordCount,
      malformedLines,
      skippedRecords,
      suppressedRows,
      unmappedAreaType,
    };
  }

  /**
   * Fails the week unless its newest `download_datetime` renders back to the anchor label the
   * scraper matched on.
   *
   * Two independent sources have to agree and nothing else compares them: the label is raw anchor
   * text scraped from the page, the stamp is a field inside the .DAT files. The next run's reference
   * is `formatPsiLabel(MAX(download_datetime))`, matched against anchor text by string equality — so
   * if they disagree, `selectNewerThan` finds no match, falls through, and returns every published
   * week. It warns when it does that, but by then the marker is already poisoned and every Monday
   * re-imports the whole listing.
   *
   * Only the newest stamp is checked because the marker *is* `MAX(...)` — an earlier-dated outlier
   * cannot move it, so it cannot affect the reference.
   */
  private assertWeekStamp(
    link: PsiWeeklyLink,
    latestStamp: number | null,
  ): void {
    if (latestStamp === null) {
      throw new PsiWeekUnusableException(
        link.label,
        'no record carries a download_datetime, so the reference query would never see this week',
      );
    }

    const rendered = formatPsiLabel(new Date(latestStamp));
    if (rendered === link.label) return;

    throw new PsiWeekUnusableException(
      link.label,
      `its newest download_datetime renders as ${rendered}, which is not the label the listing matched`,
    );
  }

  /**
   * Delegates to `PsiDatParserService.parseFile` and logs the file's counts. Named for what it adds
   * — the parsing itself happens entirely in the parser, and the result is returned unchanged.
   */
  private async parseAndLogFile(datFile: string): Promise<PsiParsedFile> {
    const parsed = await this.parser.parseFile(datFile);

    const malformedNote =
      parsed.malformedLines > 0 ? `, ${parsed.malformedLines} malformed` : '';
    this.logger.log(
      `${PSI_LOG_TAG}   ${parsed.sourceFile} — ${parsed.records.length} sale record(s), ${parsed.skippedRecords} non-B skipped${malformedNote}`,
    );

    return parsed;
  }

  private logListingSummary(listing: PsiListingResult): void {
    this.logger.log(
      `${PSI_LOG_TAG} Listing returned ${listing.totalAnchors} weekly link(s); ${listing.links.length} newer than reference`,
    );
    for (const link of listing.links) {
      this.logger.log(`${PSI_LOG_TAG}   queued ${link.label} — ${link.url}`);
    }
  }

  private logRunSummary(
    runId: string,
    results: PsiWeekResult[],
    startedAt: number,
  ): void {
    const sum = (pick: (week: PsiWeekResult) => number): number =>
      results.reduce((total, week) => total + pick(week), 0);

    const failed = results.filter((week) => week.status === 'failed').length;
    const records = sum((week) => week.recordCount);
    const files = sum((week) => week.datFileCount);
    const suppressed = sum((week) => week.suppressedRows);
    const durationMs = Date.now() - startedAt;

    this.logEvent('PSI.run.done', {
      runId,
      weeks: results.length,
      weeksSucceeded: results.length - failed,
      weeksFailed: failed,
      datFileCount: files,
      recordCount: records,
      malformedLines: sum((week) => week.malformedLines),
      skippedRecords: sum((week) => week.skippedRecords),
      suppressedRows: suppressed,
      unmappedAreaType: sum((week) => week.unmappedAreaType),
      durationMs,
    });

    // Kept alongside the JSON — this is the line a human tailing `docker logs` reads. The
    // suppressed count is surfaced here too because it is a permanent data loss, not a retryable
    // one, and a steady figure is expected rather than alarming — see PsiImportRepository.
    this.logger.log(
      `${PSI_LOG_TAG} Run complete — ${results.length} week(s)${failed > 0 ? `, ${failed} failed` : ''}, ${files} file(s), ${records.toLocaleString('en-AU')} record(s) stored${suppressed > 0 ? `, ${suppressed.toLocaleString('en-AU')} skipped on uq_psr_dealing_number` : ''} in ${Math.round(durationMs / 1000)}s`,
    );
  }

  private logWeekOutcome(runId: string, result: PsiWeekResult): void {
    this.logEvent('PSI.week.done', {
      runId,
      weekLabel: result.link.label,
      fileStem: result.link.fileStem,
      status: result.status,
      datFileCount: result.datFileCount,
      recordCount: result.recordCount,
      malformedLines: result.malformedLines,
      skippedRecords: result.skippedRecords,
      suppressedRows: result.suppressedRows,
      unmappedAreaType: result.unmappedAreaType,
      durationMs: result.durationMs,
      error: result.error,
    });
  }

  /**
   * One JSON object per line, matching `comparables.service.ts`'s `logEvent`. Stringified into the
   * message rather than passed as a second argument: Nest's built-in Logger reads a trailing
   * argument as the *context*, and this app has no Pino or custom `LoggerService`.
   */
  private logEvent(context: string, data: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({ context, ...data, ts: new Date().toISOString() }),
    );
  }
}
