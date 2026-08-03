/**
 * Reclaims disk from archives the download pipeline no longer needs.
 *
 * Two active passes, each honouring `dryRun` and collecting per-item
 * failures rather than aborting the whole run (the `reaper.ts` loop shape,
 * ported from nsw-property-sales-poc/src/cleanup/reaper.ts):
 *
 *  1. **Retired archives** — `status='loaded'` past `PSI_RETENTION_DAYS`.
 *     A `downloaded` (not yet `loaded`) row is NEVER selected here
 *     regardless of age — see archive-ledger.repository.ts's
 *     `findRetiredLoadedArchives`. This is the guarantee KAN-242's hand-off
 *     depends on: until that ticket exists and starts marking rows
 *     `loaded`, this pass is a structural no-op, not a configured one.
 *     `PSI_RETENTION_ALLOW_UNLOADED` is the explicit, logged escape hatch
 *     for ops that also reaps aged `downloaded` rows.
 *  2. **Orphaned staging directories** — a sweep that crashed mid-download
 *     can leave `<archiveRoot>/staging/<runId>/` behind; reaped by mtime
 *     age, independent of the ledger.
 *
 * Quarantine cleanup is deliberately NOT a third active pass here:
 * `PropertySalesDownloadService` never writes a physical file for a
 * `quarantined` row (see that service's own header comment — the failed
 * `.part`/GUID is already gone by the time the row is marked), so
 * `<archiveRoot>/quarantine/` is always empty under KAN-241's current
 * behaviour and a "reap it" pass here would just be dead code that always
 * finds nothing. `ArchiveStoreService.deleteQuarantineFile` and
 * `PSI_QUARANTINE_RETENTION_DAYS` are still in place, ready for whichever
 * future ticket (most likely KAN-242, once real corrupt-but-retained
 * archives can exist) actually populates that directory.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';

import { ArchiveStoreService, STAGING_ID_PATTERN } from './storage/archive-store.service';
import {
  findAgedUnloadedArchives,
  findRetiredLoadedArchives,
  markDeleted,
  type RetentionCandidate,
} from './archive-ledger.repository';
import { describeError } from './exceptions/property-sales-ingestion.exception';
import { PropertySalesConfig } from './property-sales.config';

const MS_PER_HOUR = 60 * 60 * 1000;

export interface OrphanedStagingCandidate {
  readonly runId: string;
  readonly path: string;
  readonly ageHours: number;
}

export interface RetentionPassResult<T> {
  readonly candidates: readonly T[];
  readonly deletedCount: number;
  readonly failed: readonly { id: string; error: string }[];
}

export interface RetentionRunResult {
  readonly dryRun: boolean;
  readonly retiredArchives: RetentionPassResult<RetentionCandidate>;
  readonly agedUnloadedArchives: RetentionPassResult<RetentionCandidate>;
  readonly orphanedStaging: RetentionPassResult<OrphanedStagingCandidate>;
}

@Injectable()
export class PropertySalesRetentionService {
  private readonly logger = new Logger(PropertySalesRetentionService.name);

  constructor(
    private readonly config: PropertySalesConfig,
    private readonly archiveStore: ArchiveStoreService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private logEvent(context: string, data: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ context, ...data, ts: new Date().toISOString() }));
  }

  /**
   * Lists `stagingDir`'s immediate subdirectories whose basename is a
   * well-formed run id and whose mtime is older than `maxAgeHours`. Returns
   * an empty array (never throws) when `stagingDir` does not exist yet — a
   * deployment that has never run a sweep has no staging directory at all.
   * Ported from nsw-property-sales-poc/src/cleanup/reaper.ts's
   * `findOrphanedWorkspaces`.
   */
  private async findOrphanedStagingDirs(maxAgeHours: number): Promise<readonly OrphanedStagingCandidate[]> {
    let entries;
    try {
      entries = await readdir(this.config.stagingDir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }

    const now = Date.now();
    const candidates: OrphanedStagingCandidate[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!STAGING_ID_PATTERN.test(entry.name)) continue;

      const path = join(this.config.stagingDir, entry.name);
      const st = await stat(path);
      const ageHours = (now - st.mtimeMs) / MS_PER_HOUR;
      if (ageHours > maxAgeHours) {
        candidates.push({ runId: entry.name, path, ageHours });
      }
    }

    return candidates;
  }

  private async reapRetiredArchives(
    queryRunner: QueryRunner,
    dryRun: boolean,
  ): Promise<RetentionPassResult<RetentionCandidate>> {
    const candidates = await findRetiredLoadedArchives(queryRunner, this.config.retentionDays);
    const failed: { id: string; error: string }[] = [];
    let deletedCount = 0;

    for (const candidate of candidates) {
      if (dryRun) {
        this.logEvent('PropertySalesRetention.wouldDeleteRetired', {
          id: candidate.id,
          path: candidate.localPath,
        });
        continue;
      }
      try {
        await this.archiveStore.deleteArchiveFile(candidate.localPath);
        await markDeleted(queryRunner, candidate.id);
        deletedCount += 1;
        this.logEvent('PropertySalesRetention.deletedRetired', { id: candidate.id, path: candidate.localPath });
      } catch (err) {
        const described = describeError(err);
        this.logger.warn(
          JSON.stringify({
            context: 'PropertySalesRetention.deleteRetiredFailed',
            id: candidate.id,
            path: candidate.localPath,
            ...described,
            ts: new Date().toISOString(),
          }),
        );
        failed.push({ id: candidate.id, error: described.message });
      }
    }

    return { candidates, deletedCount, failed };
  }

  private async reapAgedUnloadedArchives(
    queryRunner: QueryRunner,
    dryRun: boolean,
  ): Promise<RetentionPassResult<RetentionCandidate>> {
    const candidates = await findAgedUnloadedArchives(queryRunner, this.config.retentionUnloadedDays);
    const failed: { id: string; error: string }[] = [];
    let deletedCount = 0;

    if (candidates.length > 0) {
      this.logger.warn(
        JSON.stringify({
          context: 'PropertySalesRetention.allowUnloadedActive',
          message: 'PSI_RETENTION_ALLOW_UNLOADED is removing archives KAN-242 has not yet loaded',
          count: candidates.length,
          urls: candidates.map((c) => c.sourceUrl),
          dryRun,
          ts: new Date().toISOString(),
        }),
      );
    }

    for (const candidate of candidates) {
      if (dryRun) continue;
      try {
        await this.archiveStore.deleteArchiveFile(candidate.localPath);
        await markDeleted(queryRunner, candidate.id);
        deletedCount += 1;
      } catch (err) {
        const described = describeError(err);
        failed.push({ id: candidate.id, error: described.message });
      }
    }

    return { candidates, deletedCount, failed };
  }

  private async reapOrphanedStaging(dryRun: boolean): Promise<RetentionPassResult<OrphanedStagingCandidate>> {
    const candidates = await this.findOrphanedStagingDirs(this.config.stagingMaxAgeHours);
    const failed: { id: string; error: string }[] = [];
    let deletedCount = 0;

    for (const candidate of candidates) {
      if (dryRun) {
        this.logEvent('PropertySalesRetention.wouldDeleteOrphanedStaging', {
          runId: candidate.runId,
          path: candidate.path,
          ageHours: candidate.ageHours,
        });
        continue;
      }
      try {
        await this.archiveStore.deleteStagingWorkspace(candidate.path);
        deletedCount += 1;
      } catch (err) {
        const described = describeError(err);
        failed.push({ id: candidate.runId, error: described.message });
      }
    }

    return { candidates, deletedCount, failed };
  }

  async runRetention(dryRunOverride?: boolean): Promise<RetentionRunResult> {
    const dryRun = dryRunOverride ?? this.config.retentionDryRun;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const retiredArchives = await this.reapRetiredArchives(queryRunner, dryRun);
      const agedUnloadedArchives = this.config.retentionAllowUnloaded
        ? await this.reapAgedUnloadedArchives(queryRunner, dryRun)
        : { candidates: [], deletedCount: 0, failed: [] };
      const orphanedStaging = await this.reapOrphanedStaging(dryRun);

      this.logEvent('PropertySalesRetention.complete', {
        dryRun,
        retiredCount: retiredArchives.candidates.length,
        agedUnloadedCount: agedUnloadedArchives.candidates.length,
        orphanedStagingCount: orphanedStaging.candidates.length,
      });

      return { dryRun, retiredArchives, agedUnloadedArchives, orphanedStaging };
    } finally {
      await queryRunner.release();
    }
  }
}
