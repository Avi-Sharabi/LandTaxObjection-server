import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import yauzl from 'yauzl';
import { extract } from 'zip-lib';

import {
  type ArchiveErrorCode,
  ArchiveExtractionException,
} from './exceptions/archive-extraction.exception';

export interface ArchiveLimits {
  readonly maxTotalUncompressedBytes: number;
  readonly maxEntryUncompressedBytes: number;
  readonly maxEntryCount: number;
  readonly maxCompressionRatio: number;
}

interface ExtractedDatFile {
  readonly path: string;
  readonly relativePath: string;
}

interface ExtractionResult {
  readonly files: readonly ExtractedDatFile[];
}

const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_REGULAR_FILE = 0o100000;
const UNIX_DIRECTORY = 0o040000;
const UNIX_SYMLINK = 0o120000;
const COMPRESSION_RATIO_MINIMUM_SIZE = 1024 * 1024;
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

function assertEntryMode(
  entry: yauzl.Entry,
  isDirectory: boolean,
  archivePath: string,
): void {
  if (entry.versionMadeBy >> 8 !== 3) return;

  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  const fileType = mode & UNIX_FILE_TYPE_MASK;
  if (fileType === UNIX_SYMLINK) {
    throw archiveError(
      'ARCHIVE_INVALID',
      'entry is a symbolic link',
      archivePath,
      {
        entry: entry.fileName,
      },
    );
  }

  const expectedType = isDirectory ? UNIX_DIRECTORY : UNIX_REGULAR_FILE;
  if (fileType !== 0 && fileType !== expectedType) {
    throw archiveError(
      'ARCHIVE_INVALID',
      `entry is not a regular ${isDirectory ? 'directory' : 'file'}`,
      archivePath,
      { entry: entry.fileName },
    );
  }
}

function mapArchiveError(
  error: unknown,
  archivePath: string,
): ArchiveExtractionException {
  if (error instanceof ArchiveExtractionException) return error;

  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('absolute path:')) {
    return archiveError('ARCHIVE_INVALID', message, archivePath, {
      cause: error,
    });
  }
  if (message.startsWith('invalid relative path:')) {
    return archiveError('ARCHIVE_INVALID', message, archivePath, {
      cause: error,
    });
  }
  if (message.startsWith('invalid characters in fileName:')) {
    return archiveError('ARCHIVE_INVALID', message, archivePath, {
      cause: error,
    });
  }
  if (message.includes('bytes in the stream')) {
    return archiveError('ARCHIVE_INVALID', message, archivePath, {
      cause: error,
    });
  }
  return archiveError('ARCHIVE_INVALID', message, archivePath, {
    cause: error,
  });
}

async function inspectArchive(
  archivePath: string,
  destinationDir: string,
  limits: ArchiveLimits,
): Promise<readonly ExtractedDatFile[]> {
  const files: ExtractedDatFile[] = [];
  const seen = new Set<string>();
  let entryCount = 0;
  let totalUncompressedBytes = 0;

  try {
    const zipFile = await yauzl.openPromise(archivePath, { autoClose: true });

    for await (const entry of zipFile.eachEntry()) {
      const { relativePath, isDirectory } = assertEntryPath(
        entry.fileName,
        archivePath,
      );
      assertEntryMode(entry, isDirectory, archivePath);

      entryCount += 1;
      if (entryCount > limits.maxEntryCount) {
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
          { entry: entry.fileName },
        );
      }
      seen.add(key);

      if (isDirectory) continue;

      totalUncompressedBytes += entry.uncompressedSize;

      if (entry.uncompressedSize > limits.maxEntryUncompressedBytes) {
        throw archiveError(
          'ARCHIVE_LIMIT_EXCEEDED',
          `entry expands to ${entry.uncompressedSize} bytes`,
          archivePath,
          { entry: entry.fileName },
        );
      }
      if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
        throw archiveError(
          'ARCHIVE_LIMIT_EXCEEDED',
          `archive expands to at least ${totalUncompressedBytes} bytes`,
          archivePath,
        );
      }
      if (
        entry.uncompressedSize >= COMPRESSION_RATIO_MINIMUM_SIZE &&
        entry.uncompressedSize / Math.max(entry.compressedSize, 1) >
          limits.maxCompressionRatio
      ) {
        throw archiveError(
          'ARCHIVE_LIMIT_EXCEEDED',
          `entry exceeds the ${limits.maxCompressionRatio}:1 compression ratio limit`,
          archivePath,
          { entry: entry.fileName },
        );
      }

      if (!/\.dat$/i.test(relativePath)) continue;

      files.push({
        path: resolve(destinationDir, relativePath),
        relativePath,
      });
    }
  } catch (error) {
    throw mapArchiveError(error, archivePath);
  }

  return files;
}

export async function extractDatFiles(
  archivePath: string,
  destinationDir: string,
  limits: ArchiveLimits,
): Promise<ExtractionResult> {
  const files = await inspectArchive(archivePath, destinationDir, limits);

  if (files.length === 0) {
    throw archiveError(
      'ARCHIVE_INVALID',
      `${archivePath} contains no .dat files`,
      archivePath,
    );
  }

  await mkdir(destinationDir, { recursive: true });
  const datEntries = new Set(files.map((file) => file.relativePath));

  try {
    await extract(archivePath, destinationDir, {
      overwrite: false,
      safeSymlinksOnly: true,
      onEntry: (event) => {
        if (!datEntries.has(event.entryName)) event.preventDefault();
      },
    });
  } catch (error) {
    throw mapArchiveError(error, archivePath);
  }

  return { files };
}
