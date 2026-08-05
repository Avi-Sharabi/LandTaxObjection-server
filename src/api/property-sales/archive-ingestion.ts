import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';

import type { DownloadSession } from './archive-download';
import { extractDatFiles, type ArchiveLimits } from './archive-extractor';
import type { ArchiveCandidate } from './archive-selection.util';
import { applySaleFilters, parseDatFile, type SaleRow } from './dat-parser';
import { assertAllowedDownloadUrl } from './download-url-allowlist.util';
import { describePropertySalesError } from './exceptions/describe-property-sales-error';
import type { PropertySalesErrorCode } from './exceptions/property-sales.exception';
import { logDescribedError, logEvent } from './property-sales-log.util';
import {
  ALLOWED_DOWNLOAD_HOSTS,
  BROWSER_TIMEOUT_MS,
} from './property-sales.constants';

const logger = new Logger('PropertySalesIngestion');

// Single-consumer (only this file), unlike property-sales.constants.ts's
// other constants which are genuinely shared across multiple files.
const GIB = 1024 ** 3;

const DOWNLOAD_TIMEOUT_MS = 300_000;
const MAX_ARCHIVE_BYTES = GIB;
const LOG_SAMPLE_ROWS = 3;
const EXCLUDED_SALE_CODES: ReadonlySet<string> = new Set();
const EXCLUDED_ZONINGS: ReadonlySet<string> = new Set();
const ARCHIVE_LIMITS: ArchiveLimits = Object.freeze({
  maxTotalUncompressedBytes: 8 * GIB,
  maxEntryUncompressedBytes: GIB,
  maxEntryCount: 20_000,
  maxCompressionRatio: 200,
});

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

function basenameOfUrl(url: string): string {
  const pathname = new URL(url).pathname;
  return pathname.split('/').filter(Boolean).pop() ?? 'archive.zip';
}

/**
 * Downloads, extracts, parses, and filters one candidate archive into its
 * own subdirectory of `syncTempDir`. That subdirectory (zip + extracted .dat
 * files) is removed once this archive is done, success or failure — so an
 * archive sync's peak disk usage stays bounded to roughly one archive at a
 * time rather than accumulating across the whole sync (see
 * property-sales.constants.ts's TMP_ROOT doc comment).
 */
export async function ingestOneArchive(
  session: DownloadSession,
  candidate: ArchiveCandidate,
  syncTempDir: string,
  index: number,
): Promise<ArchiveIngestOutcome> {
  const archiveFilename = basenameOfUrl(candidate.url);
  const archiveDir = join(syncTempDir, String(index).padStart(3, '0'));

  try {
    await mkdir(archiveDir, { recursive: true });

    assertAllowedDownloadUrl(candidate.url, ALLOWED_DOWNLOAD_HOSTS);

    const destPath = join(archiveDir, archiveFilename);
    await session.download(candidate.url, destPath, {
      navigationTimeoutMs: BROWSER_TIMEOUT_MS,
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      maxBytes: MAX_ARCHIVE_BYTES,
    });

    const extractDir = join(archiveDir, 'extracted');
    const extraction = await extractDatFiles(
      destPath,
      extractDir,
      ARCHIVE_LIMITS,
    );

    const rows: SaleRow[] = [];
    let rejectedCount = 0;
    for (const file of extraction.files) {
      const parsed = await parseDatFile(file.path, file.relativePath);
      rows.push(...parsed.rows);
      rejectedCount += parsed.rejectedCount;
    }

    const { included, excludedCount } = applySaleFilters(rows, {
      excludedSaleCodes: EXCLUDED_SALE_CODES,
      excludedZonings: EXCLUDED_ZONINGS,
    });

    logEvent(logger, 'PropertySales.parsed', {
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
    if (LOG_SAMPLE_ROWS > 0) {
      logEvent(logger, 'PropertySales.sampleRows', {
        archiveFilename,
        releaseDate: candidate.releaseDate,
        sampleSize: Math.min(LOG_SAMPLE_ROWS, included.length),
        ofTotal: included.length,
        sample: included.slice(0, LOG_SAMPLE_ROWS),
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
    logDescribedError(logger, 'PropertySales.archiveFailed', described, {
      archiveFilename,
      sourceUrl: candidate.url,
    });
    return {
      sourceUrl: candidate.url,
      archiveFilename,
      releaseDate: candidate.releaseDate,
      status: 'failed',
      errorCode: described.code,
      errorMessage: described.message,
    };
  } finally {
    await rm(archiveDir, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}
