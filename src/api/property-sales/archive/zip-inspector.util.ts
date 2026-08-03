/**
 * Read-only ZIP inspection on top of yauzl: proves an archive's central
 * directory is readable and computes its SHA-256, without extracting or
 * writing anything to disk.
 *
 * KAN-241 is download-only, so unlike the POC's `zip-extractor.ts` this file
 * ports only the read-only subset — `assertArchiveReadable` and `sha256File`
 * — plus the two private helpers they depend on (`openZip`,
 * `mapZipFileError`). Full extraction (`extractArchive`, `entry-guard.ts`'s
 * path-traversal/symlink checks, `isDatFile`) is KAN-242's concern, once
 * archives are actually being parsed and loaded into `property_sales_raw`.
 *
 * Ported from nsw-property-sales-poc/src/archive/zip-extractor.ts (KAN-241).
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

import yauzl from 'yauzl';

import { PropertySalesIngestionException } from '../exceptions/property-sales-ingestion.exception';

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: true }, (err, zipFile) => {
      if (err) {
        reject(
          new PropertySalesIngestionException('ARCHIVE_UNREADABLE', `Failed to open archive: ${err.message}`, {
            cause: err,
            context: { path },
          }),
        );
        return;
      }
      if (!zipFile) {
        reject(new PropertySalesIngestionException('ARCHIVE_UNREADABLE', 'yauzl returned no zip file'));
        return;
      }
      resolve(zipFile);
    });
  });
}

/**
 * yauzl validates a subset of entry names itself (backslashes, absolute
 * paths, drive letters, ".." segments) and auto-closes the archive with a
 * plain `Error` before any entry handler ever sees the entry. This maps
 * yauzl's own messages onto this module's error codes so a malformed entry
 * name is reported precisely even though KAN-241 never extracts entries.
 */
function mapZipFileError(err: unknown, archivePath: string): PropertySalesIngestionException {
  if (err instanceof PropertySalesIngestionException) return err;
  const message = err instanceof Error ? err.message : String(err);

  if (message.startsWith('absolute path:')) {
    return new PropertySalesIngestionException('ENTRY_ABSOLUTE_PATH', message, { cause: err, context: { archivePath } });
  }
  if (message.startsWith('invalid relative path:')) {
    return new PropertySalesIngestionException('ENTRY_PATH_TRAVERSAL', message, { cause: err, context: { archivePath } });
  }
  if (message.startsWith('invalid characters in fileName:')) {
    return new PropertySalesIngestionException('ENTRY_ILLEGAL_CHARACTER', message, { cause: err, context: { archivePath } });
  }
  return new PropertySalesIngestionException('ARCHIVE_UNREADABLE', message, { cause: err, context: { archivePath } });
}

/**
 * Proves an archive's central directory is readable and returns its entry
 * count, without extracting anything.
 *
 * This exists for the download boundary: a file that carries a ZIP signature
 * can still be a truncated or corrupt transfer, and finding that out during
 * extraction is too late — by then the pipeline has already taken ownership
 * of it and written a ledger row.
 *
 * Entries are drained rather than inspected: reading to `end` is what forces
 * yauzl to walk the whole central directory.
 */
export async function assertArchiveReadable(path: string): Promise<number> {
  const zipFile = await openZip(path);
  let entryCount = 0;

  await new Promise<void>((resolveAll, rejectAll) => {
    let settled = false;
    const fail = (err: unknown): void => {
      if (settled) return;
      settled = true;
      zipFile.close();
      rejectAll(mapZipFileError(err, path));
    };

    zipFile.on('error', fail);
    zipFile.on('entry', () => {
      entryCount += 1;
      zipFile.readEntry();
    });
    zipFile.on('end', () => {
      if (settled) return;
      settled = true;
      resolveAll();
    });

    zipFile.readEntry();
  });

  return entryCount;
}

/** Streams a file to compute its SHA-256 digest without loading it into memory. */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}
