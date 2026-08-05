import { resolve } from 'node:path';

import { extract, type IEntryEvent } from 'zip-lib';

import {
  type ArchiveErrorCode,
  ArchiveExtractionException,
} from './exceptions/archive-extraction.exception';

export interface ArchiveLimits {
  /**
   * NOT enforced by extractDatFiles(). zip-lib's public extract()/onEntry
   * API (IEntryEvent) exposes only entryName/entryCount — no per-entry
   * uncompressed size — so pre-extraction zip-bomb protection by expanded
   * size is not achievable without extracting first. Field is retained only
   * so this shared config type doesn't need to change.
   */
  readonly maxTotalUncompressedBytes: number;
  /** NOT enforced — see maxTotalUncompressedBytes. */
  readonly maxEntryUncompressedBytes: number;
  /** Enforced via IEntryEvent.entryCount inside extractDatFiles(). */
  readonly maxEntryCount: number;
  /** NOT enforced — see maxTotalUncompressedBytes. */
  readonly maxCompressionRatio: number;
}

interface ExtractedDatFile {
  readonly path: string;
  readonly relativePath: string;
}

interface ExtractionResult {
  readonly files: readonly ExtractedDatFile[];
}

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function archiveError(
  code: ArchiveErrorCode,
  message: string,
  archivePath: string,
  options?: { entry?: string; cause?: unknown },
): ArchiveExtractionException {
  return new ArchiveExtractionException(code, message, {
    cause: options?.cause,
    context: {
      archivePath,
      ...(options?.entry ? { entry: options.entry } : {}),
    },
  });
}

function assertEntryPath(
  fileName: string,
  archivePath: string,
): { relativePath: string; isDirectory: boolean } {
  const reject = (reason: string): never => {
    throw archiveError('ARCHIVE_INVALID', reason, archivePath, {
      entry: fileName,
    });
  };

  if (fileName === '') reject('entry name is empty');
  for (const character of fileName) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      reject('entry name contains a control character');
    }
  }

  const isDirectory = fileName.endsWith('/');
  const relativePath = isDirectory ? fileName.slice(0, -1) : fileName;
  if (relativePath === '') {
    reject('entry name is only a separator');
  }

  for (const segment of relativePath.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      reject('entry name contains an unsafe segment');
    }
    if (segment.includes('\\')) {
      reject('entry name contains a backslash');
    }
    if (/[. ]$/.test(segment) || /[<>:"|?*]/.test(segment)) {
      reject('entry name contains a character unsupported by the filesystem');
    }
    if (WINDOWS_RESERVED_NAME.test(segment)) {
      reject(`path segment "${segment}" is a reserved device name`);
    }
  }

  return { relativePath, isDirectory };
}

function mapArchiveError(
  error: unknown,
  archivePath: string,
): ArchiveExtractionException {
  if (error instanceof ArchiveExtractionException) return error;

  // zip-lib still uses yauzl/yazl internally, so these can still surface from
  // its own extract() even though we no longer call yauzl directly:
  //   "absolute path: ..."                  (yauzl validateFileName)
  //   "invalid relative path: ..."          (yauzl validateFileName, ".." segment)
  //   "invalid characters in fileName: ..." (yauzl validateFileName)
  //   "Refuse to write file outside ..."    (zip-lib's own guard, name "AFWRITE")
  //   "Dangerous link path was refused ..." (zip-lib's own symlink guard, name "AF_ILLEGAL_TARGET")
  // All are treated uniformly as an invalid archive.
  const message = error instanceof Error ? error.message : String(error);
  return archiveError('ARCHIVE_INVALID', message, archivePath, {
    cause: error,
  });
}

export async function extractDatFiles(
  archivePath: string,
  destinationDir: string,
  limits: ArchiveLimits,
): Promise<ExtractionResult> {
  // zip-lib's extract() creates destinationDir itself before opening the
  // archive, before any per-entry validation runs — so destinationDir may
  // exist even when extraction throws below. Callers must treat it as
  // scratch space, not rely on partial contents after an error.
  const files: ExtractedDatFile[] = [];
  const seen = new Set<string>();

  try {
    await extract(archivePath, destinationDir, {
      overwrite: false,
      safeSymlinksOnly: true,
      onEntry: (event: IEntryEvent) => {
        const { relativePath, isDirectory } = assertEntryPath(
          event.entryName,
          archivePath,
        );

        // event.entryCount is the archive's fixed TOTAL entry count (not a
        // running index), so this check fires the same way on any entry.
        if (event.entryCount > limits.maxEntryCount) {
          throw archiveError(
            'ARCHIVE_LIMIT_EXCEEDED',
            `archive exceeds the ${limits.maxEntryCount} entry limit`,
            archivePath,
          );
        }

        const key = relativePath.toLowerCase();
        if (seen.has(key)) {
          throw archiveError(
            'ARCHIVE_INVALID',
            `duplicate entry name "${relativePath}"`,
            archivePath,
            { entry: event.entryName },
          );
        }
        seen.add(key);

        const isDatFile = !isDirectory && /\.dat$/i.test(relativePath);
        if (!isDatFile) {
          event.preventDefault();
          return;
        }

        files.push({
          path: resolve(destinationDir, relativePath),
          relativePath,
        });
      },
    });
  } catch (error) {
    throw mapArchiveError(error, archivePath);
  }

  if (files.length === 0) {
    throw archiveError(
      'ARCHIVE_INVALID',
      `${archivePath} contains no .dat files`,
      archivePath,
    );
  }

  return { files };
}
