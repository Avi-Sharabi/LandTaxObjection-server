/**
 * Box 4 of the pipeline — "unzip" — in one file: safe, streaming ZIP
 * extraction on top of yauzl, scoped to this pipeline's one actual need —
 * pull the `.dat` sale-record files out of a downloaded NSW weekly archive.
 *
 * Consolidated from 2 previously-separate files, both ported from
 * nsw-property-sales-poc: entry-guard.ts (entry-name/mode validation, pure)
 * and zip-extractor.ts (the yauzl-driving extraction loop). Kept as two
 * clearly-separated sections in one file rather than two files, since
 * nothing outside this module ever needs the entry-guard pieces on their
 * own.
 *
 * yauzl was chosen specifically because it does *not* resolve destination
 * paths for us — it hands back the raw central-directory `fileName` and
 * `externalFileAttributes`, forcing every safety decision through the entry
 * guard below before a byte is written. `lazyEntries: true` gives per-entry
 * backpressure so a pathological archive cannot queue thousands of open
 * file handles ahead of us.
 *
 * A weekly archive here is never itself a nested/yearly bundle (discovery
 * only ever returns `/__psi/weekly/*.zip` candidates), so unlike the
 * reference implementation there is no nested-zip recursion. Non-`.dat`
 * entries (the archive also carries a `creative_commons.txt`) are validated
 * for name-safety like every other entry, but skipped rather than written to
 * disk — there is nothing downstream that reads them.
 */

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, realpath } from 'node:fs/promises';
import {
  dirname,
  posix as posixPath,
  resolve as resolvePath,
  sep,
} from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import yauzl from 'yauzl';

import {
  type PropertySalesErrorCode,
  PropertySalesIngestionException,
} from './exceptions';

// ─────────────────────────────────────────────────────────────────────────
// Entry guard — ZIP entry safety validation. Pure — no filesystem access,
// no I/O. Every entry is judged from the *raw* central-directory name
// before a single byte is written to disk. Nothing here trusts
// `path.resolve` to have done the thinking for us; the string checks come
// first and the containment check in `resolveEntryTarget` is a
// belt-and-braces backstop.
// ─────────────────────────────────────────────────────────────────────────

export interface ArchiveLimits {
  readonly maxTotalUncompressedBytes: number;
  readonly maxEntryUncompressedBytes: number;
  readonly maxEntryCount: number;
  readonly maxCompressionRatio: number;
}

/** The subset of a yauzl entry the guard needs. Keeps the guard testable. */
export interface ZipEntryDescriptor {
  /** Raw name straight from the central directory. Never pre-normalised. */
  readonly fileName: string;
  readonly uncompressedSize: number;
  readonly compressedSize: number;
  readonly externalFileAttributes: number;
  readonly versionMadeBy: number;
}

export type EntryKind = 'file' | 'directory';

export type EntryVerdict =
  | {
      readonly ok: true;
      /** Normalised, guaranteed-relative POSIX path, safe to join to a destination. */
      readonly relativePath: string;
      readonly kind: EntryKind;
    }
  | {
      readonly ok: false;
      readonly code: PropertySalesErrorCode;
      readonly reason: string;
    };

// POSIX mode bits.
const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

/** `versionMadeBy >> 8`: 3 means the archive was produced on Unix. */
const MADE_BY_UNIX = 3;

/**
 * Compression-ratio checks only apply above this size. A 200-byte text file
 * that deflates to 20 bytes is a 10:1 ratio and completely normal; ratio
 * only signals a bomb once the absolute expanded size is meaningful.
 */
const RATIO_CHECK_FLOOR_BYTES = 1024 * 1024;

/**
 * True when the name contains NUL, a C0 control character or DEL. Written as
 * a char-code scan rather than a regex so no literal control bytes end up in
 * this source file.
 */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Windows device names, which resolve to devices regardless of directory. */
const WINDOWS_RESERVED = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

function reject(code: PropertySalesErrorCode, reason: string): EntryVerdict {
  return { ok: false, code, reason };
}

/**
 * Validates a single entry name in isolation. Split out from the stateful
 * archive guard so it can be unit-tested exhaustively against one input.
 */
export function validateEntryName(rawName: string): EntryVerdict {
  if (rawName === '') {
    return reject('ENTRY_EMPTY_NAME', 'entry name is empty');
  }

  if (hasControlCharacter(rawName)) {
    return reject(
      'ENTRY_ILLEGAL_CHARACTER',
      'entry name contains a control character',
    );
  }

  // The ZIP spec mandates '/' as the separator. A backslash is either a literal
  // filename character (which becomes a separator on Windows) or an attack.
  if (rawName.includes('\\')) {
    return reject('ENTRY_ILLEGAL_CHARACTER', 'entry name contains a backslash');
  }

  // UNC-style, checked before the absolute-path check so it reports precisely.
  if (rawName.startsWith('//')) {
    return reject('ENTRY_UNC_PATH', 'entry name looks like a UNC path');
  }

  if (rawName.startsWith('/')) {
    return reject('ENTRY_ABSOLUTE_PATH', 'entry name is an absolute path');
  }

  if (/^[A-Za-z]:/.test(rawName)) {
    return reject(
      'ENTRY_DRIVE_LETTER',
      'entry name begins with a drive letter',
    );
  }

  const isDirectory = rawName.endsWith('/');
  const trimmed = isDirectory ? rawName.slice(0, -1) : rawName;
  if (trimmed === '') {
    return reject('ENTRY_EMPTY_NAME', 'entry name is only a separator');
  }

  const segments = trimmed.split('/');
  for (const segment of segments) {
    if (segment === '') {
      return reject(
        'ENTRY_ILLEGAL_CHARACTER',
        'entry name contains an empty path segment',
      );
    }
    if (segment === '..') {
      return reject(
        'ENTRY_PATH_TRAVERSAL',
        'entry name contains a ".." segment',
      );
    }
    if (segment === '.') {
      return reject(
        'ENTRY_PATH_TRAVERSAL',
        'entry name contains a "." segment',
      );
    }
    // Windows silently strips trailing dots and spaces, so "foo. " and "foo"
    // are the same file — a way to smuggle a second write to one target.
    if (/[. ]$/.test(segment)) {
      return reject(
        'ENTRY_ILLEGAL_CHARACTER',
        'path segment ends with a dot or space',
      );
    }
    // Windows also disallows these outright; a colon additionally selects an
    // NTFS alternate data stream.
    if (/[<>:"|?*]/.test(segment)) {
      return reject(
        'ENTRY_ILLEGAL_CHARACTER',
        'path segment contains a reserved character',
      );
    }
    const base = segment.split('.')[0]?.toLowerCase() ?? '';
    if (WINDOWS_RESERVED.has(base)) {
      return reject(
        'ENTRY_RESERVED_NAME',
        `path segment "${segment}" is a reserved device name`,
      );
    }
  }

  const relativePath = segments.join('/');

  // Backstop: after all of the above, normalisation must be a no-op and the
  // result must still be relative. If this ever fires, a check above is wrong.
  const normalised = posixPath.normalize(relativePath);
  if (normalised !== relativePath || posixPath.isAbsolute(normalised)) {
    return reject(
      'ENTRY_PATH_TRAVERSAL',
      'entry name does not survive normalisation unchanged',
    );
  }

  return { ok: true, relativePath, kind: isDirectory ? 'directory' : 'file' };
}

/**
 * Inspects the Unix mode bits, when present, to reject symlinks and anything
 * that is not a plain file or directory (devices, FIFOs, sockets). Archives
 * produced on non-Unix systems carry no mode bits; those pass this stage and
 * are caught by the name and size checks.
 */
export function validateEntryMode(
  entry: ZipEntryDescriptor,
  kind: EntryKind,
): EntryVerdict | null {
  if (entry.versionMadeBy >> 8 !== MADE_BY_UNIX) return null;

  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  if (mode === 0) return null; // Unix-made but mode not populated.

  const fileType = mode & S_IFMT;
  if (fileType === S_IFLNK) {
    return reject('ENTRY_SYMLINK', 'entry is a symbolic link');
  }
  if (fileType === 0) return null; // Only permission bits set; nothing to assert.

  const expected = kind === 'directory' ? S_IFDIR : S_IFREG;
  if (fileType !== expected) {
    return reject(
      'ENTRY_NOT_REGULAR_FILE',
      `entry is not a regular ${kind} (mode type 0o${fileType.toString(8)})`,
    );
  }
  return null;
}

export interface ArchiveGuardTotals {
  readonly entryCount: number;
  readonly totalUncompressedBytes: number;
  readonly totalCompressedBytes: number;
}

/**
 * Stateful, single-archive guard. Tracks cumulative totals and previously
 * seen names so entry-count, total-size and duplicate-name limits can be
 * enforced. One instance per archive; not reusable.
 */
export interface ArchiveGuard {
  check(entry: ZipEntryDescriptor): EntryVerdict;
  totals(): ArchiveGuardTotals;
}

export function createArchiveGuard(limits: ArchiveLimits): ArchiveGuard {
  const seen = new Set<string>();
  let entryCount = 0;
  let totalUncompressed = 0;
  let totalCompressed = 0;

  return {
    check(entry) {
      const named = validateEntryName(entry.fileName);
      if (!named.ok) return named;

      const modeProblem = validateEntryMode(entry, named.kind);
      if (modeProblem !== null) return modeProblem;

      // Compare case-insensitively: on Windows "A.DAT" and "a.dat" are the same
      // file, so a case-only duplicate is a silent overwrite.
      const dedupeKey = named.relativePath.toLowerCase();
      if (seen.has(dedupeKey)) {
        return reject(
          'ENTRY_DUPLICATE_NAME',
          `duplicate entry name "${named.relativePath}"`,
        );
      }

      if (named.kind === 'file') {
        entryCount += 1;
        if (entryCount > limits.maxEntryCount) {
          return reject(
            'ARCHIVE_TOO_MANY_ENTRIES',
            `archive exceeds the ${limits.maxEntryCount} entry limit`,
          );
        }

        if (entry.uncompressedSize > limits.maxEntryUncompressedBytes) {
          return reject(
            'ENTRY_TOO_LARGE',
            `entry expands to ${entry.uncompressedSize} bytes, over the ` +
              `${limits.maxEntryUncompressedBytes} byte per-entry limit`,
          );
        }

        totalUncompressed += entry.uncompressedSize;
        totalCompressed += entry.compressedSize;
        if (totalUncompressed > limits.maxTotalUncompressedBytes) {
          return reject(
            'ARCHIVE_TOTAL_TOO_LARGE',
            `archive expands to at least ${totalUncompressed} bytes, over the ` +
              `${limits.maxTotalUncompressedBytes} byte total limit`,
          );
        }

        if (entry.uncompressedSize >= RATIO_CHECK_FLOOR_BYTES) {
          const ratio =
            entry.uncompressedSize / Math.max(entry.compressedSize, 1);
          if (ratio > limits.maxCompressionRatio) {
            return reject(
              'ENTRY_RATIO_EXCEEDED',
              `entry compression ratio ${ratio.toFixed(1)}:1 exceeds the ` +
                `${limits.maxCompressionRatio}:1 limit`,
            );
          }
        }
      }

      seen.add(dedupeKey);
      return named;
    },

    totals: () => ({
      entryCount,
      totalUncompressedBytes: totalUncompressed,
      totalCompressedBytes: totalCompressed,
    }),
  };
}

/**
 * Final containment check. `destinationRealPath` must already be resolved
 * via `fs.realpath` by the caller — this function is pure and cannot do
 * that itself. Throws rather than returning a verdict: reaching here with
 * an escaping path means a string check above failed, which is a bug, not
 * bad input.
 */
export function resolveEntryTarget(
  destinationRealPath: string,
  relativePath: string,
  pathApi: { resolve: (...parts: string[]) => string; sep: string } = {
    resolve: (...parts) => posixPath.resolve(...parts),
    sep: posixPath.sep,
  },
): string {
  const target = pathApi.resolve(destinationRealPath, relativePath);
  const prefix = destinationRealPath.endsWith(pathApi.sep)
    ? destinationRealPath
    : destinationRealPath + pathApi.sep;

  const normalise = (value: string): string =>
    process.platform === 'win32' ? value.toLowerCase() : value;

  if (!normalise(target).startsWith(normalise(prefix))) {
    throw new PropertySalesIngestionException(
      'ENTRY_ESCAPES_DESTINATION',
      'Resolved entry path escapes the destination directory',
      {
        context: {
          relativePath,
          destination: destinationRealPath,
          resolved: target,
        },
      },
    );
  }
  return target;
}

// ─────────────────────────────────────────────────────────────────────────
// ZIP extraction — the yauzl-driving loop, using the guard above to decide
// every write.
// ─────────────────────────────────────────────────────────────────────────

export interface ExtractedDatFile {
  /** Absolute path on disk. */
  readonly path: string;
  /** Path relative to the extraction root, POSIX-separated. */
  readonly relativePath: string;
  readonly uncompressedSize: number;
}

export interface ExtractionResult {
  readonly files: readonly ExtractedDatFile[];
  readonly entryCount: number;
  readonly skippedCount: number;
  readonly totalUncompressedBytes: number;
  readonly totalCompressedBytes: number;
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolvePromise, rejectPromise) => {
    yauzl.open(path, { lazyEntries: true, autoClose: true }, (err, zipFile) => {
      if (err) {
        rejectPromise(
          new PropertySalesIngestionException(
            'ARCHIVE_UNREADABLE',
            `Failed to open archive: ${err.message}`,
            {
              cause: err,
              context: { path },
            },
          ),
        );
        return;
      }
      if (!zipFile) {
        rejectPromise(
          new PropertySalesIngestionException(
            'ARCHIVE_UNREADABLE',
            'yauzl returned no zip file',
          ),
        );
        return;
      }
      resolvePromise(zipFile);
    });
  });
}

function openReadStream(
  zipFile: yauzl.ZipFile,
  entry: yauzl.Entry,
): Promise<Readable> {
  return new Promise((resolvePromise, rejectPromise) => {
    zipFile.openReadStream(entry, (err, stream) => {
      if (err) {
        rejectPromise(
          new PropertySalesIngestionException(
            'ARCHIVE_UNREADABLE',
            `Failed to read entry: ${err.message}`,
            {
              cause: err,
              context: { entry: entry.fileName },
            },
          ),
        );
        return;
      }
      if (!stream) {
        rejectPromise(
          new PropertySalesIngestionException(
            'ARCHIVE_UNREADABLE',
            'yauzl returned no read stream',
          ),
        );
        return;
      }
      resolvePromise(stream);
    });
  });
}

/**
 * yauzl validates a subset of entry names itself (backslashes, absolute
 * paths, drive letters, ".." segments) and auto-closes the archive with a
 * plain `Error` before our own `entry` handler — and therefore the guard
 * above — ever sees the entry. This maps yauzl's own messages onto our
 * error codes so that first line of defence reports as precisely as the
 * second one does.
 */
function mapZipFileError(
  err: unknown,
  archivePath: string,
): PropertySalesIngestionException {
  if (err instanceof PropertySalesIngestionException) return err;
  const message = err instanceof Error ? err.message : String(err);

  if (message.startsWith('absolute path:')) {
    return new PropertySalesIngestionException('ENTRY_ABSOLUTE_PATH', message, {
      cause: err,
      context: { archivePath },
    });
  }
  if (message.startsWith('invalid relative path:')) {
    return new PropertySalesIngestionException(
      'ENTRY_PATH_TRAVERSAL',
      message,
      { cause: err, context: { archivePath } },
    );
  }
  if (message.startsWith('invalid characters in fileName:')) {
    return new PropertySalesIngestionException(
      'ENTRY_ILLEGAL_CHARACTER',
      message,
      { cause: err, context: { archivePath } },
    );
  }
  return new PropertySalesIngestionException('ARCHIVE_UNREADABLE', message, {
    cause: err,
    context: { archivePath },
  });
}

function toDescriptor(entry: yauzl.Entry): ZipEntryDescriptor {
  return {
    fileName: entry.fileName,
    uncompressedSize: entry.uncompressedSize,
    compressedSize: entry.compressedSize,
    externalFileAttributes: entry.externalFileAttributes,
    versionMadeBy: entry.versionMadeBy,
  };
}

/** True for a `.dat` file, the NSW feed's per-district sale-records file. */
export function isDatFile(relativePath: string): boolean {
  return /\.dat$/i.test(relativePath);
}

/**
 * Extracts only the `.dat` entries of one archive into `destinationDir`,
 * which must already exist. Every entry (including ones that will be
 * skipped) is validated by the archive guard before any write occurs, and
 * counts toward the cumulative size/count limits — a zip bomb hidden behind
 * a non-`.dat` name is still a zip bomb.
 */
export async function extractDatFiles(
  archivePath: string,
  destinationDir: string,
  limits: ArchiveLimits,
): Promise<ExtractionResult> {
  await mkdir(destinationDir, { recursive: true });
  const destinationRealPath = await realpath(destinationDir);
  const guard = createArchiveGuard(limits);
  const zipFile = await openZip(archivePath);
  const files: ExtractedDatFile[] = [];
  let skippedCount = 0;

  await new Promise<void>((resolveAll, rejectAll) => {
    let settled = false;
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      zipFile.close();
      rejectAll(err);
    };
    const succeed = (): void => {
      if (settled) return;
      settled = true;
      resolveAll();
    };

    zipFile.on('error', (err: unknown) =>
      fail(mapZipFileError(err, archivePath)),
    );
    zipFile.on('end', succeed);

    zipFile.on('entry', (entry: yauzl.Entry) => {
      void (async () => {
        try {
          const verdict = guard.check(toDescriptor(entry));
          if (!verdict.ok) {
            throw new PropertySalesIngestionException(
              verdict.code,
              verdict.reason,
              {
                context: { entry: entry.fileName, archivePath },
              },
            );
          }

          if (
            verdict.kind === 'directory' ||
            !isDatFile(verdict.relativePath)
          ) {
            skippedCount += 1;
            zipFile.readEntry();
            return;
          }

          const target = resolveEntryTarget(
            destinationRealPath,
            verdict.relativePath,
            {
              resolve: (...parts) => resolvePath(...parts),
              sep,
            },
          );
          await mkdir(dirname(target), { recursive: true });

          const readStream = await openReadStream(zipFile, entry);
          const writeStream = createWriteStream(target, { flags: 'wx' });

          // yauzl's returned stream is an AssertByteCountStream: it already
          // verifies the declared vs. actual uncompressed size and emits
          // 'error' on itself if they differ. `pipeline` (unlike a bare
          // `.pipe()`) propagates that error from the source into this
          // rejection and destroys both streams — a bare `.pipe()` would not.
          try {
            await pipeline(readStream, writeStream);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('bytes in the stream')) {
              throw new PropertySalesIngestionException(
                'ENTRY_SIZE_MISMATCH',
                `Entry "${entry.fileName}" declared ${entry.uncompressedSize} bytes but did not match: ${message}`,
                {
                  cause: err,
                  context: {
                    entry: entry.fileName,
                    declared: entry.uncompressedSize,
                  },
                },
              );
            }
            throw err;
          }

          files.push({
            path: target,
            relativePath: verdict.relativePath,
            uncompressedSize: entry.uncompressedSize,
          });

          zipFile.readEntry();
        } catch (err) {
          fail(err instanceof Error ? err : new Error(String(err)));
        }
      })();
    });

    zipFile.readEntry();
  });

  const totals = guard.totals();
  if (files.length === 0) {
    throw new PropertySalesIngestionException(
      'ARCHIVE_NO_DAT_FILES',
      `${archivePath} contains no .dat files (${skippedCount} other entr${skippedCount === 1 ? 'y' : 'ies'} skipped)`,
      { context: { archivePath, skippedCount } },
    );
  }

  return {
    files,
    entryCount: totals.entryCount,
    skippedCount,
    totalUncompressedBytes: totals.totalUncompressedBytes,
    totalCompressedBytes: totals.totalCompressedBytes,
  };
}

/**
 * Proves an archive's central directory is readable and returns its entry
 * count, without extracting anything. This exists for the download
 * boundary: a file that carries a ZIP signature can still be a truncated
 * or corrupt transfer, and finding that out during extraction is too late.
 * Entries are drained rather than inspected: reading to `end` is what
 * forces yauzl to walk the whole central directory.
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
