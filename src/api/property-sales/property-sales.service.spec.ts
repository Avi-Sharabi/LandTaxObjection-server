import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';

jest.mock('./discovery-and-download', () => ({
  ...jest.requireActual<typeof import('./discovery-and-download')>(
    './discovery-and-download',
  ),
  downloadViaBrowser: jest.fn(),
}));
jest.mock('./archive-extractor', () => ({
  ...jest.requireActual<typeof import('./archive-extractor')>(
    './archive-extractor',
  ),
  extractDatFiles: jest.fn(),
}));
jest.mock('./dat-parser', () => ({
  ...jest.requireActual<typeof import('./dat-parser')>('./dat-parser'),
  parseDatFile: jest.fn(),
}));

import { downloadViaBrowser } from './discovery-and-download';
import { extractDatFiles } from './archive-extractor';
import { parseDatFile } from './dat-parser';
import type {
  ArchiveCandidate,
  PsiBrowserService,
  SourceDiscoveryService,
} from './discovery-and-download';
import type { OwnershipRecordRaw, SaleRecordRaw } from './dat-parser';
import { PropertySalesConfig } from './property-sales.config';
import { PropertySalesService } from './property-sales.service';

const downloadViaBrowserMock = downloadViaBrowser as jest.MockedFunction<
  typeof downloadViaBrowser
>;
const extractDatFilesMock = extractDatFiles as jest.MockedFunction<
  typeof extractDatFiles
>;
const parseDatFileMock = parseDatFile as jest.MockedFunction<
  typeof parseDatFile
>;

function fakeConfigService(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

/**
 * The two queries `PropertySalesService`'s private watermark reader issues, in
 * order. Returned on its own so a test can assert against the mock directly —
 * reading `dataSource.query` back off the cast would be an unbound reference to
 * TypeORM's `DataSource` method.
 */
function watermarkQueryMock(tableExists: boolean, watermark: Date | null) {
  return jest
    .fn()
    .mockImplementationOnce(() =>
      Promise.resolve([
        { to_regclass: tableExists ? 'property_sales_raw' : null },
      ]),
    )
    .mockImplementationOnce(() => Promise.resolve([{ watermark }]));
}

/** Fakes the two queries `PropertySalesService`'s private watermark reader issues, in order. */
function fakeDataSource(
  tableExists: boolean,
  watermark: Date | null,
): DataSource {
  return {
    query: watermarkQueryMock(tableExists, watermark),
  } as unknown as DataSource;
}

function candidate(url: string, releaseDate: string): ArchiveCandidate {
  return {
    url,
    label: releaseDate,
    releaseDate,
    dateSource: 'filename',
    dateMismatch: false,
  };
}

function saleRecord(overrides: Partial<SaleRecordRaw> = {}): SaleRecordRaw {
  return {
    sourceFile: '001.dat',
    lineNumber: 2,
    rawLine: 'B;...',
    type: 'B',
    districtCode: '001',
    propertyId: '123',
    saleCounter: '1',
    downloadDateTime: '20260803 01:00',
    propertyName: '',
    propertyUnitNumber: '',
    propertyHouseNumber: '4',
    propertyStreetName: 'MARKET FAIR RD',
    propertyLocality: 'NORTH ROTHBURY',
    propertyPostCode: '2335',
    area: '478.7',
    areaType: 'M',
    contractDate: '20251021',
    settlementDate: '20260724',
    purchasePrice: '385000',
    zoning: 'R2',
    natureOfProperty: 'V',
    primaryPurpose: 'VACANT LAND',
    strataLotNumber: '',
    componentCode: '',
    saleCode: '',
    interestOfSalePercent: '',
    dealingNumber: 'AW323794',
    ...overrides,
  };
}

/** A fake browser: only `.newPage()` and `.close()` are ever called by the service. */
function fakeBrowser(): { newPage: jest.Mock; close: jest.Mock } {
  return {
    newPage: jest.fn().mockResolvedValue({}),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

describe('PropertySalesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns skipped_disabled and never launches the browser when the feature is disabled', async () => {
    const config = new PropertySalesConfig(fakeConfigService({}));
    const launch = jest.fn();
    const query = jest.fn();
    const psiBrowser = { launch } as unknown as PsiBrowserService;
    const sourceDiscovery = {
      discoverArchiveCandidates: jest.fn(),
    } as unknown as SourceDiscoveryService;
    const dataSource = { query } as unknown as DataSource;

    const service = new PropertySalesService(
      config,
      psiBrowser,
      sourceDiscovery,
      dataSource,
    );
    const result = await service.run();

    expect(result).toEqual({ status: 'skipped_disabled' });
    expect(launch).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('returns skipped_concurrent when a sweep is already in flight', async () => {
    const config = new PropertySalesConfig(
      fakeConfigService({ PSI_DOWNLOAD_ENABLED: 'true' }),
    );
    const dataSource = fakeDataSource(false, null);
    const sourceDiscovery = {
      discoverArchiveCandidates: jest.fn().mockResolvedValue([]),
    } as unknown as SourceDiscoveryService;
    const psiBrowser = {
      launch: jest.fn().mockResolvedValue(fakeBrowser()),
    } as unknown as PsiBrowserService;

    const service = new PropertySalesService(
      config,
      psiBrowser,
      sourceDiscovery,
      dataSource,
    );
    // `run()` sets its in-process `isRunning` flag synchronously, before its
    // first `await` — so a second call issued before the first is awaited
    // is guaranteed to observe it, with no need for either call to hang.
    const first = service.run();
    const second = await service.run();

    expect(second).toEqual({ status: 'skipped_concurrent' });
    await expect(first).resolves.toMatchObject({
      status: 'completed',
      discoveredCount: 0,
    });
  });

  it('treats a missing property_sales_raw table as no watermark, without querying MAX()', async () => {
    const config = new PropertySalesConfig(
      fakeConfigService({ PSI_DOWNLOAD_ENABLED: 'true' }),
    );
    const query = watermarkQueryMock(false, null);
    const dataSource = { query } as unknown as DataSource;
    const sourceDiscovery = {
      discoverArchiveCandidates: jest.fn().mockResolvedValue([]),
    } as unknown as SourceDiscoveryService;
    const psiBrowser = {
      launch: jest.fn().mockResolvedValue(fakeBrowser()),
    } as unknown as PsiBrowserService;

    const service = new PropertySalesService(
      config,
      psiBrowser,
      sourceDiscovery,
      dataSource,
    );
    const result = await service.run();

    expect(result).toMatchObject({ status: 'completed', discoveredCount: 0 });
    expect(query).toHaveBeenCalledTimes(1); // only the to_regclass check, never MAX()
  });

  it('filters to candidates newer than the watermark and processes oldest-first', async () => {
    const config = new PropertySalesConfig(
      fakeConfigService({
        PSI_DOWNLOAD_ENABLED: 'true',
        PSI_MAX_ARCHIVES_PER_RUN: '5',
      }),
    );
    const dataSource = fakeDataSource(
      true,
      new Date('2026-07-27T00:00:00.000Z'),
    );

    // Discovery returns newest-first, as SourceDiscoveryService documents.
    const candidates = [
      candidate(
        'https://www.valuergeneral.nsw.gov.au/__psi/weekly/20260810.zip',
        '2026-08-10',
      ),
      candidate(
        'https://www.valuergeneral.nsw.gov.au/__psi/weekly/20260803.zip',
        '2026-08-03',
      ),
      candidate(
        'https://www.valuergeneral.nsw.gov.au/__psi/weekly/20260720.zip',
        '2026-07-20',
      ), // older than watermark
    ];
    const sourceDiscovery = {
      discoverArchiveCandidates: jest.fn().mockResolvedValue(candidates),
    } as unknown as SourceDiscoveryService;
    const psiBrowser = {
      launch: jest.fn().mockResolvedValue(fakeBrowser()),
    } as unknown as PsiBrowserService;

    downloadViaBrowserMock.mockResolvedValue({
      bytes: 100,
      sha256: 'x'.repeat(64),
      entryCount: 1,
    });
    extractDatFilesMock.mockResolvedValue({
      files: [
        { path: '/tmp/001.dat', relativePath: '001.dat', uncompressedSize: 10 },
      ],
      entryCount: 1,
      skippedCount: 0,
      totalUncompressedBytes: 10,
      totalCompressedBytes: 5,
    });
    parseDatFileMock.mockResolvedValue({
      sourceFile: '001.dat',
      header: {
        type: 'A',
        sourceFile: '001.dat',
        lineNumber: 1,
        rawLine: '',
        fileType: 'RTSALEDATA',
        districtCode: '001',
        downloadDateTime: '',
        submittingUserId: '',
      },
      sales: [saleRecord()],
      legalDescriptions: [],
      ownerships: [] as OwnershipRecordRaw[],
      trailer: {
        type: 'Z',
        sourceFile: '001.dat',
        lineNumber: 3,
        rawLine: '',
        totalLines: '3',
        bCount: '1',
        cCount: '0',
        dCount: '0',
      },
      lineCount: 3,
    });

    const service = new PropertySalesService(
      config,
      psiBrowser,
      sourceDiscovery,
      dataSource,
    );
    const result = await service.run();

    expect(result.status).toBe('completed');
    expect(result.discoveredCount).toBe(3);
    expect(result.consideredCount).toBe(2); // the 2026-07-20 candidate is not newer than the watermark

    // Oldest-first: 2026-08-03 before 2026-08-10.
    const processedUrls = downloadViaBrowserMock.mock.calls.map(
      ([, url]) => url,
    );
    expect(processedUrls).toEqual([
      'https://www.valuergeneral.nsw.gov.au/__psi/weekly/20260803.zip',
      'https://www.valuergeneral.nsw.gov.au/__psi/weekly/20260810.zip',
    ]);

    expect(result.archives).toHaveLength(2);
    expect(result.archives?.every((a) => a.status === 'parsed')).toBe(true);
    expect(result.archives?.[0]).toMatchObject({
      saleRowCount: 1,
      excludedCount: 0,
      rejectedCount: 0,
    });
  });

  it("one archive's failure is logged and does not abort the rest of the sweep", async () => {
    const config = new PropertySalesConfig(
      fakeConfigService({ PSI_DOWNLOAD_ENABLED: 'true' }),
    );
    const dataSource = fakeDataSource(false, null);
    const candidates = [
      candidate(
        'https://www.valuergeneral.nsw.gov.au/__psi/weekly/20260727.zip',
        '2026-07-27',
      ),
      candidate(
        'https://www.valuergeneral.nsw.gov.au/__psi/weekly/20260803.zip',
        '2026-08-03',
      ),
    ];
    const sourceDiscovery = {
      discoverArchiveCandidates: jest.fn().mockResolvedValue(candidates),
    } as unknown as SourceDiscoveryService;
    const psiBrowser = {
      launch: jest.fn().mockResolvedValue(fakeBrowser()),
    } as unknown as PsiBrowserService;

    downloadViaBrowserMock
      .mockRejectedValueOnce(new Error('download failed'))
      .mockResolvedValueOnce({
        bytes: 100,
        sha256: 'x'.repeat(64),
        entryCount: 1,
      });
    extractDatFilesMock.mockResolvedValue({
      files: [],
      entryCount: 0,
      skippedCount: 0,
      totalUncompressedBytes: 0,
      totalCompressedBytes: 0,
    });

    const service = new PropertySalesService(
      config,
      psiBrowser,
      sourceDiscovery,
      dataSource,
    );
    const result = await service.run();

    expect(result.status).toBe('completed');
    expect(result.archives).toHaveLength(2);
    expect(result.archives?.[0]).toMatchObject({ status: 'failed' });
    expect(result.archives?.[1]).toMatchObject({ status: 'parsed' });
  });

  it('applies the configured content-exclusion filter to parsed rows', async () => {
    const config = new PropertySalesConfig(
      fakeConfigService({
        PSI_DOWNLOAD_ENABLED: 'true',
        PSI_EXCLUDE_SALE_CODES: 'AC',
      }),
    );
    const dataSource = fakeDataSource(false, null);
    const candidates = [
      candidate(
        'https://www.valuergeneral.nsw.gov.au/__psi/weekly/20260803.zip',
        '2026-08-03',
      ),
    ];
    const sourceDiscovery = {
      discoverArchiveCandidates: jest.fn().mockResolvedValue(candidates),
    } as unknown as SourceDiscoveryService;
    const psiBrowser = {
      launch: jest.fn().mockResolvedValue(fakeBrowser()),
    } as unknown as PsiBrowserService;

    downloadViaBrowserMock.mockResolvedValue({
      bytes: 100,
      sha256: 'x'.repeat(64),
      entryCount: 1,
    });
    extractDatFilesMock.mockResolvedValue({
      files: [
        { path: '/tmp/001.dat', relativePath: '001.dat', uncompressedSize: 10 },
      ],
      entryCount: 1,
      skippedCount: 0,
      totalUncompressedBytes: 10,
      totalCompressedBytes: 5,
    });
    parseDatFileMock.mockResolvedValue({
      sourceFile: '001.dat',
      header: {
        type: 'A',
        sourceFile: '001.dat',
        lineNumber: 1,
        rawLine: '',
        fileType: 'RTSALEDATA',
        districtCode: '001',
        downloadDateTime: '',
        submittingUserId: '',
      },
      sales: [
        saleRecord({ saleCode: 'AC' }),
        saleRecord({ propertyId: '456', saleCode: '' }),
      ],
      legalDescriptions: [],
      ownerships: [],
      trailer: {
        type: 'Z',
        sourceFile: '001.dat',
        lineNumber: 4,
        rawLine: '',
        totalLines: '4',
        bCount: '2',
        cCount: '0',
        dCount: '0',
      },
      lineCount: 4,
    });

    const service = new PropertySalesService(
      config,
      psiBrowser,
      sourceDiscovery,
      dataSource,
    );
    const result = await service.run();

    expect(result.archives?.[0]).toMatchObject({
      saleRowCount: 2,
      excludedCount: 1,
    });
    expect(result.archives?.[0].rows?.map((r) => r.propertyId)).toEqual([
      '456',
    ]);
  });
});
