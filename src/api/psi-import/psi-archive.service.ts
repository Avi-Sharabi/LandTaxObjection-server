import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readdir } from 'fs/promises';
import { basename, extname, join } from 'path';
import { Unzip, type IEntryEvent } from 'zip-lib';

import {
  PSI_EXTRACT_DIRNAME,
  PSI_LOG_TAG,
  PSI_MAX_ARCHIVE_DEPTH,
} from './psi-import.constant';

export interface PsiExtractionResult {
  /** Absolute paths of every .DAT file found, at any nesting level. */
  readonly datFiles: string[];
  /** How many nested archives were opened below the weekly bundle. */
  readonly nestedArchiveCount: number;
}

const KEEPABLE_ENTRY_PATTERN = /\.(zip|dat)$/i;

@Injectable()
export class PsiArchiveService {
  private readonly logger = new Logger(PsiArchiveService.name);

  /**
   * Extracts a weekly bundle and every archive nested inside it, returning the .DAT files found.
   *
   * Nesting is the normal case, not an edge case: the weekly bundle holds one archive per Local
   * Government Area, and the .DAT files live inside those.
   */
  async extractWeeklyArchive(
    zipPath: string,
    runDir: string,
  ): Promise<PsiExtractionResult> {
    const extractRoot = join(runDir, PSI_EXTRACT_DIRNAME);
    await mkdir(extractRoot, { recursive: true });

    await this.extractOne(zipPath, extractRoot);

    const datFiles: string[] = [];
    const nestedArchiveCount = await this.extractNested(
      extractRoot,
      datFiles,
      1,
    );

    return { datFiles, nestedArchiveCount };
  }

  /**
   * Walks a directory, extracting any archive it finds into a sibling folder and collecting .DAT
   * paths. `depth` caps the recursion so a malformed or self-referential archive cannot loop.
   */
  private async extractNested(
    dir: string,
    datFiles: string[],
    depth: number,
  ): Promise<number> {
    const entries = await readdir(dir, { withFileTypes: true });
    let nestedCount = 0;

    // Sequential by design: extracting a hundred LGA archives concurrently would spike memory
    // and disk IO on a container that is also running Chromium.
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        nestedCount += await this.extractNested(fullPath, datFiles, depth);
        continue;
      }

      const ext = extname(entry.name).toLowerCase();

      if (ext === '.dat') {
        datFiles.push(fullPath);
        continue;
      }

      if (ext !== '.zip') continue;

      if (depth >= PSI_MAX_ARCHIVE_DEPTH) {
        this.logger.warn(
          `${PSI_LOG_TAG}   Nesting cap (${PSI_MAX_ARCHIVE_DEPTH}) reached — not opening ${entry.name}`,
        );
        continue;
      }

      const nestedDir = join(dir, basename(entry.name, ext));
      await mkdir(nestedDir, { recursive: true });
      await this.extractOne(fullPath, nestedDir);
      nestedCount += 1;
      nestedCount += await this.extractNested(nestedDir, datFiles, depth + 1);
    }

    return nestedCount;
  }

  /**
   * Extracts a single archive, skipping entries that are neither archives nor data files.
   * The bundles ship PDFs and readmes that would otherwise be written to disk for nothing.
   */
  private async extractOne(zipPath: string, targetDir: string): Promise<void> {
    const unzip = new Unzip({
      overwrite: false,
      onEntry: (event: IEntryEvent) => {
        const isDirectoryEntry = event.entryName.endsWith('/');
        if (isDirectoryEntry) return;
        if (!KEEPABLE_ENTRY_PATTERN.test(event.entryName)) {
          event.preventDefault();
        }
      },
    });

    await unzip.extract(zipPath, targetDir);
  }
}
