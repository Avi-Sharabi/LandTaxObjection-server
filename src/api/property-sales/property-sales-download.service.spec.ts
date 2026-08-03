import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, QueryRunner } from 'typeorm';

jest.mock('./download/browser-downloader.util');
import { downloadViaBrowser } from './download/browser-downloader.util';

import { PropertySalesDownloadService } from './property-sales-download.service';
import { PropertySalesConfig } from './property-sales.config';
import { ArchiveStoreService } from './storage/archive-store.service';
import type { ArchiveCandidate } from './discovery/link-extractor.util';

const downloadViaBrowserMock = downloadViaBrowser as jest.MockedFunction<typeof downloadViaBrowser>;

interface LedgerRow {
  id: string;
  status: string;
  attemptCount: number;
  archiveFilename: string;
  releaseDate: string;
  [key: string]: unknown;
}

/**
 * Pattern-matches on SQL shape rather than re-implementing Postgres. This
 * tests PropertySalesDownloadService's OWN branching (skip already-held,
 * retry failed, honour maxArchives, one failure doesn't block the rest,
 * dry-run touches nothing) — not whether the real ON CONFLICT/RETURNING SQL
 * is semantically correct against a live Postgres, which was verified
 * separately by hand against the real dev database (see PR notes).
 */
function fakeQueryRunner(
  ledger: Map<string, LedgerRow>,
  opts: { lockAvailable?: boolean } = {},
): { queryRunner: QueryRunner; queries: Array<{ sql: string; params: unknown[] }> } {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  let nextId = 1;

  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });

    if (sql.includes('pg_try_advisory_lock')) return [{ locked: opts.lockAvailable ?? true }];
    if (sql.includes('pg_advisory_unlock')) return [{}];
    if (sql.includes('DOWNLOAD_ABANDONED')) return [];
    if (sql.includes("status = 'discovered'")) return [];
    if (sql.includes('SELECT source_url, status FROM property_sales_archives')) {
      const urls = params[0] as string[];
      return urls.filter((u) => ledger.has(u)).map((u) => ({ source_url: u, status: ledger.get(u)!.status }));
    }
    if (sql.includes('ON CONFLICT (source_url)')) {
      const [sourceUrl, archiveFilename, releaseDate] = params as [string, string, string];
      const existing = ledger.get(sourceUrl);
      const blocked = new Set(['downloading', 'downloaded', 'loading', 'loaded']);
      if (existing && blocked.has(existing.status)) return [];
      const attemptCount = (existing?.attemptCount ?? 0) + 1;
      const id = existing?.id ?? `row-${nextId++}`;
      const row: LedgerRow = { id, status: 'downloading', attemptCount, archiveFilename, releaseDate };
      ledger.set(sourceUrl, row);
      return [{ id, attempt_count: attemptCount }];
    }
    if (sql.includes("status = 'downloaded'")) {
      const [id, localPath, sizeBytes, sha256, entryCount] = params;
      for (const row of ledger.values()) {
        if (row.id === id) Object.assign(row, { status: 'downloaded', localPath, sizeBytes, sha256, entryCount });
      }
      return [];
    }
    if (sql.includes("status = 'quarantined'")) {
      const [id, errorCode, errorMessage] = params;
      for (const row of ledger.values()) {
        if (row.id === id) Object.assign(row, { status: 'quarantined', errorCode, errorMessage });
      }
      return [];
    }
    if (sql.includes("status = 'download_failed'")) {
      const [id, errorCode, errorMessage] = params;
      for (const row of ledger.values()) {
        if (row.id === id) Object.assign(row, { status: 'download_failed', errorCode, errorMessage });
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

  return { queryRunner, queries };
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

function candidate(url: string, releaseDate: string): ArchiveCandidate {
  return { url, label: releaseDate, releaseDate, dateSource: 'filename', dateMismatch: false };
}

let archiveRoot: string;

beforeEach(async () => {
  archiveRoot = await mkdtemp(join(tmpdir(), 'psi-download-service-'));
  downloadViaBrowserMock.mockReset();
});

afterEach(async () => {
  await rm(archiveRoot, { recursive: true, force: true });
});

function buildService(opts: {
  config?: PropertySalesConfig;
  ledger?: Map<string, LedgerRow>;
  lockAvailable?: boolean;
  candidates?: ArchiveCandidate[];
}) {
  const config = opts.config ?? fakeConfig(archiveRoot);
  const archiveStore = new ArchiveStoreService(config);
  const { queryRunner, queries } = fakeQueryRunner(opts.ledger ?? new Map(), {
    lockAvailable: opts.lockAvailable,
  });
  const dataSource = { createQueryRunner: () => queryRunner } as unknown as DataSource;

  const psiBrowser = {
    launch: jest.fn().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({}),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  };
  const sourceDiscovery = {
    discoverArchiveCandidates: jest.fn().mockResolvedValue(opts.candidates ?? []),
  };

  const service = new PropertySalesDownloadService(
    config,
    archiveStore,
    psiBrowser as never,
    sourceDiscovery as never,
    dataSource,
  );

  return { service, queries, psiBrowser, sourceDiscovery, config };
}

function successfulDownload() {
  downloadViaBrowserMock.mockImplementation(async (_browser, _url, destinationPath) => {
    await writeFile(destinationPath, 'zip-bytes');
    return { bytes: 999, sha256: 'b'.repeat(64), entryCount: 7 };
  });
}

describe('PropertySalesDownloadService.runSweep', () => {
  it('returns skipped_disabled and never launches a browser when the feature is off', async () => {
    const config = fakeConfig(archiveRoot, { PSI_DOWNLOAD_ENABLED: 'false' });
    const { service, psiBrowser } = buildService({ config });

    const result = await service.runSweep();

    expect(result.status).toBe('skipped_disabled');
    expect(psiBrowser.launch).not.toHaveBeenCalled();
  });

  it('returns skipped_concurrent and never launches a browser when the advisory lock is held elsewhere', async () => {
    const { service, psiBrowser } = buildService({
      lockAvailable: false,
      candidates: [candidate('https://example.gov.au/__psi/weekly/20260803.zip', '2026-08-03')],
    });

    const result = await service.runSweep();

    expect(result.status).toBe('skipped_concurrent');
    expect(psiBrowser.launch).not.toHaveBeenCalled();
  });

  it('skips a candidate whose ledger status is already downloaded, without calling the downloader', async () => {
    const url = 'https://example.gov.au/__psi/weekly/20260803.zip';
    const ledger = new Map<string, LedgerRow>([
      [url, { id: 'row-1', status: 'downloaded', attemptCount: 1, archiveFilename: '20260803.zip', releaseDate: '2026-08-03' }],
    ]);
    const { service } = buildService({ ledger, candidates: [candidate(url, '2026-08-03')] });

    const result = await service.runSweep();

    expect(result.outcomes).toEqual([]);
    expect(downloadViaBrowserMock).not.toHaveBeenCalled();
  });

  it('retries a candidate whose ledger status is download_failed', async () => {
    successfulDownload();
    const url = 'https://example.gov.au/__psi/weekly/20260803.zip';
    const ledger = new Map<string, LedgerRow>([
      [url, { id: 'row-1', status: 'download_failed', attemptCount: 1, archiveFilename: '20260803.zip', releaseDate: '2026-08-03' }],
    ]);
    const { service } = buildService({ ledger, candidates: [candidate(url, '2026-08-03')] });

    const result = await service.runSweep();

    expect(downloadViaBrowserMock).toHaveBeenCalledTimes(1);
    expect(result.outcomes?.[0]).toMatchObject({ status: 'downloaded' });
  });

  it('honours maxArchivesPerRun and processes the OLDEST unheld weeks first', async () => {
    successfulDownload();
    // Newest-first, matching what SourceDiscoveryService actually returns.
    const candidates = [
      candidate('https://example.gov.au/__psi/weekly/20260803.zip', '2026-08-03'),
      candidate('https://example.gov.au/__psi/weekly/20260727.zip', '2026-07-27'),
      candidate('https://example.gov.au/__psi/weekly/20260720.zip', '2026-07-20'),
    ];
    const config = fakeConfig(archiveRoot, { PSI_MAX_ARCHIVES_PER_RUN: '2' });
    const { service } = buildService({ config, candidates });

    const result = await service.runSweep();

    expect(result.outcomes?.map((o) => o.releaseDate)).toEqual(['2026-07-20', '2026-07-27']);
  });

  it('one archive failing leaves it download_failed and still processes the rest', async () => {
    // Newest-first, matching what SourceDiscoveryService actually returns —
    // the orchestrator reverses this internally to process oldest-first.
    const candidates = [
      candidate('https://example.gov.au/__psi/weekly/20260727.zip', '2026-07-27'),
      candidate('https://example.gov.au/__psi/weekly/20260720.zip', '2026-07-20'),
    ];
    downloadViaBrowserMock.mockImplementation(async (_browser, url, destinationPath) => {
      if (url.includes('20260720')) throw new Error('simulated failure');
      await writeFile(destinationPath, 'zip-bytes');
      return { bytes: 3, sha256: 'a'.repeat(64), entryCount: 1 };
    });
    const { service } = buildService({ candidates });

    const result = await service.runSweep();

    expect(result.outcomes).toEqual([
      expect.objectContaining({ releaseDate: '2026-07-20', status: 'download_failed' }),
      expect.objectContaining({ releaseDate: '2026-07-27', status: 'downloaded' }),
    ]);
  });

  it('dryRun downloads nothing and never issues the atomic claim', async () => {
    const candidates = [candidate('https://example.gov.au/__psi/weekly/20260803.zip', '2026-08-03')];
    const { service, queries } = buildService({ candidates });

    const result = await service.runSweep({ dryRun: true });

    expect(result.outcomes).toEqual([]);
    expect(downloadViaBrowserMock).not.toHaveBeenCalled();
    expect(queries.some((q) => q.sql.includes('ON CONFLICT'))).toBe(false);
  });

  it('a successful download records sha256, size, entry count, local_path and status=downloaded', async () => {
    successfulDownload();
    const url = 'https://example.gov.au/__psi/weekly/20260803.zip';
    const ledger = new Map<string, LedgerRow>();
    const { service } = buildService({ ledger, candidates: [candidate(url, '2026-08-03')] });

    await service.runSweep();

    const row = ledger.get(url)!;
    expect(row.status).toBe('downloaded');
    expect(row.sha256).toBe('b'.repeat(64));
    expect(row.sizeBytes).toBe(999);
    expect(row.entryCount).toBe(7);
    expect(String(row.localPath)).toContain('2026-08-03-20260803.zip');
  });

  it('never issues any statement mentioning property_sales_raw (hard constraint regression guard)', async () => {
    successfulDownload();
    const { service, queries } = buildService({
      candidates: [candidate('https://example.gov.au/__psi/weekly/20260803.zip', '2026-08-03')],
    });

    await service.runSweep();

    expect(queries.some((q) => /property_sales_raw/i.test(q.sql))).toBe(false);
  });
});
