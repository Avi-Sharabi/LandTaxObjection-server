/**
 * Validated creation and deletion of everything under `PropertySalesConfig`'s
 * archive root: per-sweep staging workspaces, final archive files, and
 * quarantined failures.
 *
 * This is the ONLY place in the property-sales module allowed to call
 * `fs.rm` — every deletion goes through `assertSafeToDelete` first, which
 * proves the target resolves (symlinks followed) to a strict, direct child
 * of the expected boundary directory before anything is removed. Mirrors
 * this repo's existing safety posture (nsw-property-sales-poc/CLAUDE.md:
 * "never delete outside a validated temporary run directory") extended to
 * cover archive files and quarantine, not just run workspaces.
 *
 * Ported from nsw-property-sales-poc/src/cleanup/temp-workspace.ts
 * (KAN-241). Two adaptations:
 *  - `assertSafeToDelete` is generalised to take a `basenamePattern`
 *    parameter, so the same function polices staging directories (UUID
 *    names), archive files (`YYYY-MM-DD-<filename>.zip`), and quarantine
 *    files (`<sha256>-<runId>.zip`) instead of only run-id directories.
 *  - Fixes a real defect in the port: the POC calls `stat()` then checks
 *    `isSymbolicLink()`, but `stat` follows symlinks, so that branch could
 *    never fire — a symlinked leaf would silently fall through to the
 *    realpath containment check instead of being rejected outright. This
 *    version uses `lstat`, which reports on the leaf itself.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, lstat, realpath, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, parse as parsePath, resolve as resolvePath, sep } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import { PropertySalesConfig } from '../property-sales.config';
import { PropertySalesIngestionException } from '../exceptions/property-sales-ingestion.exception';

/** Well-formed staging workspace names only: a UUID, so a directory name can't be crafted. */
export const STAGING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `<release-date>-<original-filename>.zip`, e.g. `2026-08-03-20260803.zip`. */
export const ARCHIVE_FILENAME_PATTERN = /^\d{4}-\d{2}-\d{2}-[A-Za-z0-9._-]+\.zip$/i;

/** `<sha256>-<runId>.zip`. */
export const QUARANTINE_FILENAME_PATTERN =
  /^[0-9a-f]{64}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.zip$/i;

export interface StagingWorkspace {
  readonly runId: string;
  readonly stagingDir: string;
}

function isFilesystemRoot(path: string): boolean {
  const parsed = parsePath(path);
  return parsed.root === path;
}

@Injectable()
export class ArchiveStoreService {
  private readonly logger = new Logger(ArchiveStoreService.name);

  constructor(private readonly config: PropertySalesConfig) {}

  private logEvent(context: string, data: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ context, ...data, ts: new Date().toISOString() }));
  }

  /**
   * Proves that `target` is safe to recursively delete: it must resolve
   * (with symlinks followed) to a strict, direct child of the given,
   * already-real `boundaryRoot`, its own basename must match
   * `basenamePattern`, and it must not itself be a symlink or a filesystem
   * root.
   *
   * Throws `WORKSPACE_UNSAFE_DELETE` on any failed check and
   * `WORKSPACE_UNRESOLVABLE` if realpath cannot resolve the target — an
   * unresolvable path is refused, never deleted.
   */
  async assertSafeToDelete(
    target: string,
    boundaryRoot: string,
    basenamePattern: RegExp,
  ): Promise<string> {
    if (!isAbsolute(target)) {
      throw new PropertySalesIngestionException(
        'WORKSPACE_UNSAFE_DELETE',
        'Delete target must be an absolute path',
        { context: { target } },
      );
    }

    const basename = target.split(/[\\/]/).filter(Boolean).pop() ?? '';
    if (!basenamePattern.test(basename)) {
      throw new PropertySalesIngestionException(
        'WORKSPACE_UNSAFE_DELETE',
        `Delete target's basename "${basename}" does not match the expected pattern`,
        { context: { target, basename } },
      );
    }

    let targetStat;
    try {
      // lstat, not stat: stat follows a symlink at the final path component,
      // so isSymbolicLink() would describe whatever the link points to, not
      // the leaf itself, and could never report true for a symlinked leaf.
      targetStat = await lstat(target);
    } catch (err) {
      throw new PropertySalesIngestionException(
        'WORKSPACE_UNRESOLVABLE',
        `Cannot stat delete target, refusing to delete: ${target}`,
        { cause: err, context: { target } },
      );
    }
    if (targetStat.isSymbolicLink()) {
      throw new PropertySalesIngestionException(
        'WORKSPACE_UNSAFE_DELETE',
        'Refusing to delete a symlinked target',
        { context: { target } },
      );
    }

    let realTarget: string;
    let realRoot: string;
    try {
      realTarget = await realpath(target);
      realRoot = await realpath(boundaryRoot);
    } catch (err) {
      throw new PropertySalesIngestionException(
        'WORKSPACE_UNRESOLVABLE',
        'Cannot resolve real path of delete target or boundary root, refusing to delete',
        { cause: err, context: { target, boundaryRoot } },
      );
    }

    if (isFilesystemRoot(realTarget)) {
      throw new PropertySalesIngestionException(
        'WORKSPACE_UNSAFE_DELETE',
        'Refusing to delete a filesystem root',
        { context: { target: realTarget } },
      );
    }
    if (realTarget === realRoot) {
      throw new PropertySalesIngestionException(
        'WORKSPACE_UNSAFE_DELETE',
        'Refusing to delete the boundary root itself',
        { context: { target: realTarget } },
      );
    }

    const rootWithSep = realRoot.endsWith(sep) ? realRoot : realRoot + sep;
    const normalise = (value: string): string => (process.platform === 'win32' ? value.toLowerCase() : value);
    if (!normalise(realTarget).startsWith(normalise(rootWithSep))) {
      throw new PropertySalesIngestionException(
        'WORKSPACE_UNSAFE_DELETE',
        `Delete target "${realTarget}" is not inside the boundary root "${realRoot}"`,
        { context: { target: realTarget, boundaryRoot: realRoot } },
      );
    }
    // Guard against a target nested one level too deep still resolving under
    // the root due to symlink trickery inside it: require the *immediate*
    // parent of realTarget to equal realRoot.
    if (dirname(realTarget) !== realRoot) {
      throw new PropertySalesIngestionException(
        'WORKSPACE_UNSAFE_DELETE',
        `Delete target "${realTarget}" is not a direct child of the boundary root`,
        { context: { target: realTarget, boundaryRoot: realRoot } },
      );
    }

    return realTarget;
  }

  /** Creates `<archiveRoot>/staging/<runId>/` for one sweep's downloads-in-progress. */
  async createStagingWorkspace(): Promise<StagingWorkspace> {
    const runId = randomUUID();
    await mkdir(this.config.stagingDir, { recursive: true });
    const stagingDir = resolvePath(this.config.stagingDir, runId);
    await mkdir(stagingDir, { recursive: true });
    return { runId, stagingDir };
  }

  /** Recursively deletes a staging workspace after re-proving it is safe to do so. */
  async deleteStagingWorkspace(stagingDir: string): Promise<void> {
    await mkdir(this.config.stagingDir, { recursive: true });
    const boundaryRoot = await realpath(this.config.stagingDir);
    const verified = await this.assertSafeToDelete(stagingDir, boundaryRoot, STAGING_ID_PATTERN);
    await rm(verified, { recursive: true, force: false });
    this.logEvent('ArchiveStore.deleteStagingWorkspace', { path: verified });
  }

  /**
   * Moves a failed archive into `<archiveRoot>/quarantine/` instead of
   * deleting it, named by sha256 and run id so repeated failures of the
   * same bytes don't collide and remain individually inspectable.
   */
  async quarantineArchive(archivePath: string, sha256: string, runId: string): Promise<string> {
    await mkdir(this.config.quarantineDir, { recursive: true });
    const destination = resolvePath(this.config.quarantineDir, `${sha256}-${runId}.zip`);
    await rename(archivePath, destination);
    this.logEvent('ArchiveStore.quarantineArchive', { archivePath, destination, sha256, runId });
    return destination;
  }

  /** Deletes one final archive file (retention's "retired archive" pass). */
  async deleteArchiveFile(path: string): Promise<void> {
    await mkdir(this.config.archivesDir, { recursive: true });
    const boundaryRoot = await realpath(this.config.archivesDir);
    const verified = await this.assertSafeToDelete(path, boundaryRoot, ARCHIVE_FILENAME_PATTERN);
    await rm(verified, { force: false });
    this.logEvent('ArchiveStore.deleteArchiveFile', { path: verified });
  }

  /** Deletes one quarantined file (retention's quarantine-expiry pass). */
  async deleteQuarantineFile(path: string): Promise<void> {
    await mkdir(this.config.quarantineDir, { recursive: true });
    const boundaryRoot = await realpath(this.config.quarantineDir);
    const verified = await this.assertSafeToDelete(path, boundaryRoot, QUARANTINE_FILENAME_PATTERN);
    await rm(verified, { force: false });
    this.logEvent('ArchiveStore.deleteQuarantineFile', { path: verified });
  }
}
