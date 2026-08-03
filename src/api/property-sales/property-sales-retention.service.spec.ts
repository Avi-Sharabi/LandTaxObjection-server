import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, QueryRunner } from 'typeorm';

import { PropertySalesRetentionService } from './property-sales-retention.service';
import { PropertySalesConfig } from './property-sales.config';
import { ArchiveStoreService } from './storage/archive-store.service';

interface FakeRow {
  id: string;
  sourceUrl: string;
  localPath: string | null;
  status: string;
  loadedAt?: Date;
  downloadedAt?: Date;
}

function fakeQueryRunner(rows: FakeRow[]): { queryRunner: QueryRunner } {
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("status = 'loaded'") && sql.includes('loaded_at')) {
      const days = Number(params[0]);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      return rows
        .filter((r) => r.status === 'loaded' && r.localPath && r.loadedAt && r.loadedAt.getTime() < cutoff)
        .map((r) => ({ id: r.id, source_url: r.sourceUrl, local_path: r.localPath }));
    }
    if (sql.includes("status = 'downloaded'") && sql.includes('downloaded_at')) {
      const days = Number(params[0]);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      return rows
        .filter((r) => r.status === 'downloaded' && r.localPath && r.downloadedAt && r.downloadedAt.getTime() < cutoff)
        .map((r) => ({ id: r.id, source_url: r.sourceUrl, local_path: r.localPath }));
    }
    if (sql.includes("status = 'deleted'")) {
      const [id] = params as [string];
      const row = rows.find((r) => r.id === id);
      if (row) {
        row.status = 'deleted';
        row.localPath = null;
      }
      return [];
    }
    throw new Error(`fakeQueryRunner: unhandled SQL: ${sql}`);
  });

  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query,
  } as unknown as QueryRunner;

  return { queryRunner };
}

function fakeConfig(archiveRoot: string, overrides: Record<string, string> = {}): PropertySalesConfig {
  const values: Record<string, string> = {
    PSI_DOWNLOAD_ENABLED: 'true',
    PSI_ARCHIVE_ROOT: archiveRoot,
    ...overrides,
  };
  const configService = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new PropertySalesConfig(configService);
}

let archiveRoot: string;

beforeEach(async () => {
  archiveRoot = await mkdtemp(join(tmpdir(), 'psi-retention-'));
});

afterEach(async () => {
  await rm(archiveRoot, { recursive: true, force: true });
});

function buildService(opts: {
  config?: PropertySalesConfig;
  rows?: FakeRow[];
}): { service: PropertySalesRetentionService; rows: FakeRow[] } {
  const config = opts.config ?? fakeConfig(archiveRoot);
  const archiveStore = new ArchiveStoreService(config);
  const rows = opts.rows ?? [];
  const { queryRunner } = fakeQueryRunner(rows);
  const dataSource = { createQueryRunner: () => queryRunner } as unknown as DataSource;

  const service = new PropertySalesRetentionService(config, archiveStore, dataSource);
  return { service, rows };
}

async function createArchiveFile(relativeName: string): Promise<string> {
  const dir = join(archiveRoot, 'archives');
  await mkdir(dir, { recursive: true });
  const path = join(dir, relativeName);
  await writeFile(path, 'zip bytes');
  return path;
}

const TEN_YEARS_AGO = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000);
const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);

describe('PropertySalesRetentionService.runRetention — retired (loaded) archives', () => {
  it('does not select a downloaded row aged 10 years when allowUnloaded=false (the KAN-242 hand-off guarantee)', async () => {
    const localPath = await createArchiveFile('2016-01-01-old.zip');
    const rows: FakeRow[] = [
      { id: 'row-1', sourceUrl: 'https://x/old.zip', localPath, status: 'downloaded', downloadedAt: TEN_YEARS_AGO },
    ];
    const { service } = buildService({ rows });

    const result = await service.runRetention(false);

    expect(result.retiredArchives.candidates).toEqual([]);
    expect(result.agedUnloadedArchives.candidates).toEqual([]);
    // The file must still exist — nothing was ever a candidate for deletion.
    await expect(stat(localPath)).resolves.toBeTruthy();
  });

  it('selects a loaded row past PSI_RETENTION_DAYS and deletes its file', async () => {
    const localPath = await createArchiveFile('2016-01-01-old.zip');
    const rows: FakeRow[] = [
      { id: 'row-1', sourceUrl: 'https://x/old.zip', localPath, status: 'loaded', loadedAt: TEN_YEARS_AGO },
    ];
    const { service, rows: liveRows } = buildService({ rows });

    const result = await service.runRetention(false);

    expect(result.retiredArchives.deletedCount).toBe(1);
    expect(result.retiredArchives.failed).toEqual([]);
    await expect(stat(localPath)).rejects.toThrow();
    expect(liveRows[0].status).toBe('deleted');
  });

  it('does not select a loaded row still within the retention window', async () => {
    const localPath = await createArchiveFile('2026-recent.zip');
    const rows: FakeRow[] = [
      { id: 'row-1', sourceUrl: 'https://x/recent.zip', localPath, status: 'loaded', loadedAt: YESTERDAY },
    ];
    const { service } = buildService({ rows });

    const result = await service.runRetention(false);

    expect(result.retiredArchives.candidates).toEqual([]);
    await expect(stat(localPath)).resolves.toBeTruthy();
  });

  it('dryRun deletes nothing', async () => {
    const localPath = await createArchiveFile('2016-01-01-old.zip');
    const rows: FakeRow[] = [
      { id: 'row-1', sourceUrl: 'https://x/old.zip', localPath, status: 'loaded', loadedAt: TEN_YEARS_AGO },
    ];
    const { service, rows: liveRows } = buildService({ rows });

    const result = await service.runRetention(true);

    expect(result.dryRun).toBe(true);
    expect(result.retiredArchives.candidates).toHaveLength(1);
    expect(result.retiredArchives.deletedCount).toBe(0);
    await expect(stat(localPath)).resolves.toBeTruthy();
    expect(liveRows[0].status).toBe('loaded');
  });

  it('one failing deletion is collected into failed and the remaining candidate is still processed', async () => {
    const goodPath = await createArchiveFile('2016-01-01-good.zip');
    const missingPath = join(archiveRoot, 'archives', '2016-01-01-missing.zip'); // never created
    const rows: FakeRow[] = [
      { id: 'row-missing', sourceUrl: 'https://x/missing.zip', localPath: missingPath, status: 'loaded', loadedAt: TEN_YEARS_AGO },
      { id: 'row-good', sourceUrl: 'https://x/good.zip', localPath: goodPath, status: 'loaded', loadedAt: TEN_YEARS_AGO },
    ];
    const { service, rows: liveRows } = buildService({ rows });

    const result = await service.runRetention(false);

    expect(result.retiredArchives.deletedCount).toBe(1);
    expect(result.retiredArchives.failed).toHaveLength(1);
    expect(result.retiredArchives.failed[0].id).toBe('row-missing');
    expect(liveRows.find((r) => r.id === 'row-good')?.status).toBe('deleted');
    expect(liveRows.find((r) => r.id === 'row-missing')?.status).toBe('loaded');
  });
});

describe('PropertySalesRetentionService.runRetention — PSI_RETENTION_ALLOW_UNLOADED', () => {
  it('leaves an aged downloaded row alone by default', async () => {
    const localPath = await createArchiveFile('2016-01-01-unloaded.zip');
    const rows: FakeRow[] = [
      { id: 'row-1', sourceUrl: 'https://x/unloaded.zip', localPath, status: 'downloaded', downloadedAt: TEN_YEARS_AGO },
    ];
    const { service } = buildService({ rows });

    const result = await service.runRetention(false);

    expect(result.agedUnloadedArchives.candidates).toEqual([]);
    await expect(stat(localPath)).resolves.toBeTruthy();
  });

  it('selects and deletes an aged downloaded row when the escape hatch is enabled', async () => {
    const localPath = await createArchiveFile('2016-01-01-unloaded.zip');
    const rows: FakeRow[] = [
      { id: 'row-1', sourceUrl: 'https://x/unloaded.zip', localPath, status: 'downloaded', downloadedAt: TEN_YEARS_AGO },
    ];
    const config = fakeConfig(archiveRoot, { PSI_RETENTION_ALLOW_UNLOADED: 'true' });
    const { service } = buildService({ config, rows });

    const result = await service.runRetention(false);

    expect(result.agedUnloadedArchives.deletedCount).toBe(1);
    await expect(stat(localPath)).rejects.toThrow();
  });
});

describe('PropertySalesRetentionService.runRetention — orphaned staging directories', () => {
  it('reaps a staging directory older than PSI_STAGING_MAX_AGE_HOURS', async () => {
    const runId = '11111111-1111-1111-1111-111111111111';
    const dir = join(archiveRoot, 'staging', runId);
    await mkdir(dir, { recursive: true });
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(dir, old, old);

    const { service } = buildService({});
    const result = await service.runRetention(false);

    expect(result.orphanedStaging.deletedCount).toBe(1);
    await expect(stat(dir)).rejects.toThrow();
  });

  it('leaves a recent staging directory alone', async () => {
    const runId = '22222222-2222-2222-2222-222222222222';
    const dir = join(archiveRoot, 'staging', runId);
    await mkdir(dir, { recursive: true });

    const { service } = buildService({});
    const result = await service.runRetention(false);

    expect(result.orphanedStaging.candidates).toEqual([]);
    await expect(stat(dir)).resolves.toBeTruthy();
  });

  it('returns an empty result rather than throwing when the staging directory does not exist yet', async () => {
    const { service } = buildService({});
    const result = await service.runRetention(false);
    expect(result.orphanedStaging.candidates).toEqual([]);
  });

  it('dryRun leaves an orphaned staging directory in place', async () => {
    const runId = '33333333-3333-3333-3333-333333333333';
    const dir = join(archiveRoot, 'staging', runId);
    await mkdir(dir, { recursive: true });
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(dir, old, old);

    const { service } = buildService({});
    const result = await service.runRetention(true);

    expect(result.orphanedStaging.candidates).toHaveLength(1);
    expect(result.orphanedStaging.deletedCount).toBe(0);
    await expect(stat(dir)).resolves.toBeTruthy();
  });
});
