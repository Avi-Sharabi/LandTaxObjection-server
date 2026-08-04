import { EventEmitter } from 'node:events';
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import type { Browser as PuppeteerBrowser } from 'puppeteer';

import {
  type ArchiveCandidate,
  assertAllowedDownloadUrl,
  assertDownloadedZip,
  type BrowserDownloadOptions,
  dedupeCandidates,
  downloadViaBrowser,
  type DiscoveryFrame,
  type DiscoveryPage,
  extractCandidateArchiveLinks,
  parseAustralianDateLabel,
  parseFilenameReleaseDate,
  resolveReleaseDate,
  type SettleOptions,
  SourceDiscoveryService,
  sortCandidatesNewestFirst,
} from './discovery-and-download';
import type { PropertySalesConfig } from './property-sales.config';
import {
  BULK_PSI_WEEKLY_HTML,
  CLOUDFLARE_CHALLENGE_HTML,
  PORTAL_ENTRY_NO_LINKS_HTML,
} from './__testing__/discovery-html.fixture';
import { buildSimpleZip, buildZip } from './__testing__/zip-builder';

const WEEKLY_PATTERN = /^\/__psi\/weekly\/\d{8}\.zip$/i;
const BASE = 'https://example.gov.au/psi/';

function candidate(url: string, releaseDate: string): ArchiveCandidate {
  return {
    url,
    label: releaseDate,
    releaseDate,
    dateSource: 'filename',
    dateMismatch: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Link extraction
// ─────────────────────────────────────────────────────────────────────────

describe('extractCandidateArchiveLinks', () => {
  it('finds weekly archives and resolves them to absolute URLs', () => {
    const found = extractCandidateArchiveLinks(
      BULK_PSI_WEEKLY_HTML,
      WEEKLY_PATTERN,
      BASE,
    );

    expect(found.map((c) => c.url).sort()).toEqual([
      'https://example.gov.au/__psi/weekly/20260713.zip',
      'https://example.gov.au/__psi/weekly/20260720.zip',
      'https://example.gov.au/__psi/weekly/20260727.zip',
    ]);
  });

  it('resolves a relative href against the document base', () => {
    const found = extractCandidateArchiveLinks(
      BULK_PSI_WEEKLY_HTML,
      WEEKLY_PATTERN,
      BASE,
    );
    const relative = found.find((c) => c.releaseDate === '2026-07-20');
    expect(relative?.url).toBe(
      'https://example.gov.au/__psi/weekly/20260720.zip',
    );
  });

  it('excludes yearly archives and unrelated links', () => {
    const found = extractCandidateArchiveLinks(
      BULK_PSI_WEEKLY_HTML,
      WEEKLY_PATTERN,
      BASE,
    );
    expect(found.some((c) => c.url.includes('/yearly/'))).toBe(false);
    expect(found.some((c) => c.url.includes('/about'))).toBe(false);
  });

  it('captures the visible label, stripping nested tags and entities', () => {
    const found = extractCandidateArchiveLinks(
      BULK_PSI_WEEKLY_HTML,
      WEEKLY_PATTERN,
      BASE,
    );
    const byDate = new Map(found.map((c) => [c.releaseDate, c.label]));

    expect(byDate.get('2026-07-13')).toBe('13 Jul 2026');
    expect(byDate.get('2026-07-27')).toBe('27 Jul 2026'); // was wrapped in <span>
    expect(byDate.get('2026-07-20')).toBe('20 Jul 2026'); // was &nbsp;-separated
  });

  it('returns no candidates for a page with no archive links', () => {
    expect(
      extractCandidateArchiveLinks(
        PORTAL_ENTRY_NO_LINKS_HTML,
        WEEKLY_PATTERN,
        'https://example.gov.au/',
      ),
    ).toEqual([]);
  });

  it('drops a matching link that carries no parseable date', () => {
    const html = `<a href="/__psi/weekly/latest.zip">Most recent</a>`;
    const found = extractCandidateArchiveLinks(
      html,
      /^\/__psi\/weekly\/.*\.zip$/i,
      BASE,
    );
    expect(found).toEqual([]);
  });

  it('skips an unparseable href instead of throwing', () => {
    const html = `<a href="ht!tp://[bad">bad</a><a href="/__psi/weekly/20260727.zip">27 Jul 2026</a>`;
    const found = extractCandidateArchiveLinks(
      html,
      WEEKLY_PATTERN,
      'https://example.gov.au/',
    );
    expect(found.map((c) => c.url)).toEqual([
      'https://example.gov.au/__psi/weekly/20260727.zip',
    ]);
  });

  it('matches case-insensitively regardless of pattern flags supplied', () => {
    const html = `<a HREF="/__psi/WEEKLY/20260727.ZIP">27 Jul 2026</a>`;
    const found = extractCandidateArchiveLinks(
      html,
      /^\/__psi\/weekly\/\d{8}\.zip$/,
      'https://example.gov.au/',
    );
    expect(found.map((c) => c.url)).toEqual([
      'https://example.gov.au/__psi/WEEKLY/20260727.ZIP',
    ]);
  });

  it('finds every candidate rather than stopping at the first', () => {
    expect(
      extractCandidateArchiveLinks(BULK_PSI_WEEKLY_HTML, WEEKLY_PATTERN, BASE),
    ).toHaveLength(3);
  });
});

describe('sortCandidatesNewestFirst', () => {
  it('orders by release date, most recent first', () => {
    const found = extractCandidateArchiveLinks(
      BULK_PSI_WEEKLY_HTML,
      WEEKLY_PATTERN,
      BASE,
    );
    expect(sortCandidatesNewestFirst(found).map((c) => c.releaseDate)).toEqual([
      '2026-07-27',
      '2026-07-20',
      '2026-07-13',
    ]);
  });

  it('orders by date even when URLs do not sort chronologically', () => {
    const candidates = [
      candidate(
        'https://example.gov.au/__psi/weekly/20260803.zip',
        '2026-08-03',
      ),
      candidate(
        'https://example.gov.au/__psi/weekly/9260727.zip',
        '2026-07-27',
      ),
    ];
    expect(
      sortCandidatesNewestFirst(candidates).map((c) => c.releaseDate),
    ).toEqual(['2026-08-03', '2026-07-27']);
  });

  it('breaks ties on URL deterministically', () => {
    const a = candidate('https://example.gov.au/a/20260727.zip', '2026-07-27');
    const b = candidate('https://example.gov.au/b/20260727.zip', '2026-07-27');
    expect(sortCandidatesNewestFirst([a, b])[0]?.url).toBe(b.url);
    expect(sortCandidatesNewestFirst([b, a])[0]?.url).toBe(b.url);
  });

  it('does not mutate the input array', () => {
    const candidates = [
      candidate(
        'https://example.gov.au/__psi/weekly/20260713.zip',
        '2026-07-13',
      ),
      candidate(
        'https://example.gov.au/__psi/weekly/20260727.zip',
        '2026-07-27',
      ),
    ];
    const snapshot = candidates.map((c) => c.url);
    sortCandidatesNewestFirst(candidates);
    expect(candidates.map((c) => c.url)).toEqual(snapshot);
  });
});

describe('dedupeCandidates', () => {
  it('keeps the first occurrence of each URL across frames', () => {
    const a = candidate(
      'https://example.gov.au/__psi/weekly/20260727.zip',
      '2026-07-27',
    );
    const b = candidate(
      'https://example.gov.au/__psi/weekly/20260720.zip',
      '2026-07-20',
    );
    expect(dedupeCandidates([a, b, { ...a, label: 'duplicate' }])).toEqual([
      a,
      b,
    ]);
  });

  it('returns an empty array unchanged', () => {
    expect(dedupeCandidates([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Release date parsing
// ─────────────────────────────────────────────────────────────────────────

describe('parseFilenameReleaseDate', () => {
  it('reads the YYYYMMDD stem out of a weekly archive URL', () => {
    expect(
      parseFilenameReleaseDate(
        'https://example.gov.au/__psi/weekly/20260727.zip',
      ),
    ).toBe('2026-07-27');
  });

  it('accepts a bare path as well as an absolute URL', () => {
    expect(parseFilenameReleaseDate('/__psi/weekly/20260105.zip')).toBe(
      '2026-01-05',
    );
  });

  it('ignores a query string and mixed-case extension', () => {
    expect(
      parseFilenameReleaseDate(
        'https://example.gov.au/__psi/weekly/20260713.ZIP?v=2',
      ),
    ).toBe('2026-07-13');
  });

  it('returns null for a yearly archive, which is what keeps it out of weekly selection', () => {
    expect(
      parseFilenameReleaseDate('https://example.gov.au/__psi/yearly/1990.zip'),
    ).toBeNull();
  });

  it('rejects an impossible calendar date in the filename', () => {
    expect(parseFilenameReleaseDate('/__psi/weekly/20260230.zip')).toBeNull();
    expect(parseFilenameReleaseDate('/__psi/weekly/20261301.zip')).toBeNull();
  });

  it('returns null rather than throwing on junk', () => {
    expect(parseFilenameReleaseDate('not a url at all')).toBeNull();
    expect(parseFilenameReleaseDate('')).toBeNull();
  });
});

describe('parseAustralianDateLabel', () => {
  it('parses the abbreviated month form the listing uses', () => {
    expect(parseAustralianDateLabel('27 Jul 2026')).toBe('2026-07-27');
    expect(parseAustralianDateLabel('05 Jan 2026')).toBe('2026-01-05');
  });

  it('parses the full month name and a single-digit day', () => {
    expect(parseAustralianDateLabel('27 July 2026')).toBe('2026-07-27');
    expect(parseAustralianDateLabel('5 September 2026')).toBe('2026-09-05');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(parseAustralianDateLabel('  27   JUL   2026 ')).toBe('2026-07-27');
    expect(parseAustralianDateLabel('27-jul-2026')).toBe('2026-07-27');
  });

  it('reads numeric dates day-first, per Australian convention', () => {
    expect(parseAustralianDateLabel('05/01/2026')).toBe('2026-01-05');
    expect(parseAustralianDateLabel('27/07/2026')).toBe('2026-07-27');
    expect(parseAustralianDateLabel('27-07-2026')).toBe('2026-07-27');
    expect(parseAustralianDateLabel('27.07.2026')).toBe('2026-07-27');
  });

  it('rejects impossible dates', () => {
    expect(parseAustralianDateLabel('32 Jan 2026')).toBeNull();
    expect(parseAustralianDateLabel('30 Feb 2026')).toBeNull();
    expect(parseAustralianDateLabel('29 Feb 2025')).toBeNull();
    expect(parseAustralianDateLabel('13/25/2026')).toBeNull();
  });

  it('accepts a real leap day', () => {
    expect(parseAustralianDateLabel('29 Feb 2028')).toBe('2028-02-29');
  });

  it('returns null for labels that are not dates', () => {
    expect(parseAustralianDateLabel('1990')).toBeNull();
    expect(parseAustralianDateLabel('Weekly sales data')).toBeNull();
    expect(parseAustralianDateLabel('27 Smarch 2026')).toBeNull();
    expect(parseAustralianDateLabel('')).toBeNull();
  });
});

describe('resolveReleaseDate', () => {
  it('prefers the filename and reports agreement with the label', () => {
    expect(
      resolveReleaseDate('/__psi/weekly/20260727.zip', '27 Jul 2026'),
    ).toEqual({
      date: '2026-07-27',
      source: 'filename',
      mismatch: false,
    });
  });

  it('flags a filename/label disagreement while still trusting the filename', () => {
    expect(
      resolveReleaseDate('/__psi/weekly/20260727.zip', '20 Jul 2026'),
    ).toEqual({
      date: '2026-07-27',
      source: 'filename',
      mismatch: true,
    });
  });

  it('falls back to the label when the filename carries no date', () => {
    expect(
      resolveReleaseDate('/__psi/weekly/latest.zip', '27 Jul 2026'),
    ).toEqual({
      date: '2026-07-27',
      source: 'label',
      mismatch: false,
    });
  });

  it('returns null when neither source yields a date', () => {
    expect(resolveReleaseDate('/__psi/yearly/1990.zip', '1990')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// URL guard (SSRF)
// ─────────────────────────────────────────────────────────────────────────

describe('assertAllowedDownloadUrl', () => {
  const ALLOWED = [
    'valuation.property.nsw.gov.au',
    'www.valuergeneral.nsw.gov.au',
  ];

  it('accepts an https URL whose host is on the allowlist', () => {
    const url =
      'https://valuation.property.nsw.gov.au/__psi/weekly/20260727.zip';
    expect(assertAllowedDownloadUrl(url, ALLOWED).href).toBe(url);
  });

  it('rejects an http (non-https) URL', () => {
    expect(() =>
      assertAllowedDownloadUrl(
        'http://valuation.property.nsw.gov.au/file.zip',
        ALLOWED,
      ),
    ).toThrow(/https/);
  });

  it('rejects a host not on the allowlist (SSRF guard)', () => {
    expect(() =>
      assertAllowedDownloadUrl('https://evil.example.com/file.zip', ALLOWED),
    ).toThrow(/not on the configured allowlist/);
  });

  it('rejects an attempt to target a private/internal address', () => {
    expect(() =>
      assertAllowedDownloadUrl(
        'https://169.254.169.254/latest/meta-data',
        ALLOWED,
      ),
    ).toThrow(/not on the configured allowlist/);
    expect(() =>
      assertAllowedDownloadUrl('https://localhost:5432/', ALLOWED),
    ).toThrow(/not on the configured allowlist/);
  });

  it('rejects an unparseable URL', () => {
    expect(() => assertAllowedDownloadUrl('not a url', ALLOWED)).toThrow();
  });

  it('matches the host case-insensitively', () => {
    const url = 'https://VALUATION.PROPERTY.NSW.GOV.AU/file.zip';
    expect(() => assertAllowedDownloadUrl(url, ALLOWED)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// SourceDiscoveryService
// ─────────────────────────────────────────────────────────────────────────

describe('discoverArchiveCandidates', () => {
  const LISTING_URL =
    'https://www.valuergeneral.nsw.gov.au/design/bulk_psi_content/bulk_psi';

  const BASE_CONFIG = {
    discoveryUrl: LISTING_URL,
    allowedDownloadHosts: ['www.valuergeneral.nsw.gov.au', 'example.gov.au'],
    weeklyLinkPattern: /^\/__psi\/weekly\/\d{8}\.zip$/i,
    browserTimeoutMs: 5000,
    headless: false,
  } as unknown as PropertySalesConfig;

  /** Tests must not spend the real 15s settling budget. */
  const NO_SETTLE: SettleOptions = { budgetMs: 0, pollMs: 1 };

  function frame(url: string, html: string): DiscoveryFrame {
    return { url: () => url, content: jest.fn().mockResolvedValue(html) };
  }

  interface FakePageOptions {
    readonly frames: DiscoveryFrame[];
    readonly status?: number | null;
    readonly title?: string;
    readonly url?: string;
  }

  function fakePage(options: FakePageOptions): DiscoveryPage {
    return {
      goto: jest.fn().mockResolvedValue({ status: options.status ?? 200 }),
      title: jest.fn().mockResolvedValue(options.title ?? 'Bulk PSI'),
      url: () => options.url ?? LISTING_URL,
      frames: () => options.frames,
    };
  }

  function service(
    config: Partial<PropertySalesConfig> = {},
  ): SourceDiscoveryService {
    return new SourceDiscoveryService({
      ...BASE_CONFIG,
      ...config,
    } as PropertySalesConfig);
  }

  it('returns every weekly archive candidate, newest first', async () => {
    const page = fakePage({
      frames: [frame(LISTING_URL, BULK_PSI_WEEKLY_HTML)],
    });

    const found = await service().discoverArchiveCandidates(page, NO_SETTLE);

    expect(found.map((c) => c.releaseDate)).toEqual([
      '2026-07-27',
      '2026-07-20',
      '2026-07-13',
    ]);
    expect(found[0]?.url).toBe(
      'https://example.gov.au/__psi/weekly/20260727.zip',
    );
    expect(found[0]?.label).toBe('27 Jul 2026');
    expect(found[0]?.dateSource).toBe('filename');
  });

  it('navigates to the configured discovery URL', async () => {
    // `goto` is held locally rather than read back off the page, which would be
    // an unbound reference to puppeteer's `Page.goto` method.
    const goto = jest.fn().mockResolvedValue({ status: 200 });
    const page: DiscoveryPage = {
      ...fakePage({ frames: [frame(LISTING_URL, BULK_PSI_WEEKLY_HTML)] }),
      goto,
    };

    await service().discoverArchiveCandidates(page, NO_SETTLE);

    expect(goto).toHaveBeenCalledWith(LISTING_URL, {
      waitUntil: 'networkidle2',
      timeout: 5000,
    });
  });

  it('does not override the browser User-Agent, which is what gets a session blocked', async () => {
    const page = fakePage({
      frames: [frame(LISTING_URL, BULK_PSI_WEEKLY_HTML)],
    });

    await service().discoverArchiveCandidates(page, NO_SETTLE);

    expect(page).not.toHaveProperty('setUserAgent');
  });

  it('finds a listing served inside a child frame', async () => {
    const page = fakePage({
      frames: [
        frame(
          LISTING_URL,
          '<h1>Bulk PSI</h1><iframe src="./listing"></iframe>',
        ),
        frame(
          'https://www.valuergeneral.nsw.gov.au/listing',
          BULK_PSI_WEEKLY_HTML,
        ),
      ],
    });

    const found = await service().discoverArchiveCandidates(page, NO_SETTLE);
    expect(found[0]?.releaseDate).toBe('2026-07-27');
  });

  it('skips about: frames and an unreadable frame without failing the pass', async () => {
    const content = jest.fn().mockRejectedValue(new Error('detached frame'));
    const unreadable: DiscoveryFrame = {
      url: () => 'https://www.valuergeneral.nsw.gov.au/other',
      content,
    };
    const page = fakePage({
      frames: [
        frame('about:blank', ''),
        unreadable,
        frame(LISTING_URL, BULK_PSI_WEEKLY_HTML),
      ],
    });

    const found = await service().discoverArchiveCandidates(page, NO_SETTLE);
    expect(found[0]?.releaseDate).toBe('2026-07-27');
    expect(content).toHaveBeenCalled();
  });

  it('deduplicates a link that appears in more than one frame', async () => {
    const single = `<a href="/__psi/weekly/20260727.zip">27 Jul 2026</a>`;
    const page = fakePage({
      frames: [
        frame('https://example.gov.au/a', single),
        frame('https://example.gov.au/b', single),
      ],
    });

    const found = await service().discoverArchiveCandidates(page, NO_SETTLE);
    expect(found).toHaveLength(1);
    expect(found[0]?.url).toBe(
      'https://example.gov.au/__psi/weekly/20260727.zip',
    );
  });

  it('throws DISCOVERY_NO_CANDIDATES when the page loads normally but has no links', async () => {
    const page = fakePage({
      frames: [frame(LISTING_URL, PORTAL_ENTRY_NO_LINKS_HTML)],
    });

    await expect(
      service().discoverArchiveCandidates(page, NO_SETTLE),
    ).rejects.toMatchObject({
      code: 'DISCOVERY_NO_CANDIDATES',
    });
  });

  it('throws DISCOVERY_BLOCKED, not NO_CANDIDATES, on a 403 interstitial', async () => {
    const page = fakePage({
      frames: [frame(LISTING_URL, CLOUDFLARE_CHALLENGE_HTML)],
      status: 403,
      title: 'Just a moment...',
    });

    await expect(
      service().discoverArchiveCandidates(page, NO_SETTLE),
    ).rejects.toMatchObject({
      code: 'DISCOVERY_BLOCKED',
    });
  });

  it('detects a challenge from the page title even on a 200 response', async () => {
    const page = fakePage({
      frames: [frame(LISTING_URL, CLOUDFLARE_CHALLENGE_HTML)],
      status: 200,
      title: 'Just a moment...',
    });

    await expect(
      service().discoverArchiveCandidates(page, NO_SETTLE),
    ).rejects.toMatchObject({
      code: 'DISCOVERY_BLOCKED',
    });
  });

  it('detects a challenge from a Cloudflare frame URL', async () => {
    const page = fakePage({
      frames: [
        frame(LISTING_URL, '<p>nothing here</p>'),
        frame(
          'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x',
          '',
        ),
      ],
      status: 200,
      title: 'Bulk PSI',
    });

    await expect(
      service().discoverArchiveCandidates(page, NO_SETTLE),
    ).rejects.toMatchObject({
      code: 'DISCOVERY_BLOCKED',
    });
  });

  it('excludes a candidate whose host is not on the allowlist, keeping the ones that pass', async () => {
    const html =
      `<a href="https://evil.test/__psi/weekly/20260727.zip">27 Jul 2026</a>` +
      `<a href="https://example.gov.au/__psi/weekly/20260720.zip">20 Jul 2026</a>`;
    const page = fakePage({ frames: [frame(LISTING_URL, html)] });

    const found = await service().discoverArchiveCandidates(page, NO_SETTLE);
    expect(found).toHaveLength(1);
    expect(found[0]?.url).toBe(
      'https://example.gov.au/__psi/weekly/20260720.zip',
    );
  });

  it('throws DISCOVERY_NO_CANDIDATES when every candidate is on a disallowed host', async () => {
    const page = fakePage({
      frames: [
        frame(
          LISTING_URL,
          `<a href="https://evil.test/__psi/weekly/20260727.zip">27 Jul 2026</a>`,
        ),
      ],
    });

    await expect(
      service().discoverArchiveCandidates(page, NO_SETTLE),
    ).rejects.toMatchObject({
      code: 'DISCOVERY_NO_CANDIDATES',
    });
  });

  it('re-reads the page while it settles, then succeeds', async () => {
    const content = jest
      .fn()
      .mockResolvedValueOnce(CLOUDFLARE_CHALLENGE_HTML) // first pass: still challenged
      .mockResolvedValue(BULK_PSI_WEEKLY_HTML); // after settling: the real listing
    const page = fakePage({ frames: [{ url: () => LISTING_URL, content }] });

    const found = await service().discoverArchiveCandidates(page, {
      budgetMs: 10,
      pollMs: 1,
    });

    expect(found[0]?.releaseDate).toBe('2026-07-27');
    expect(content.mock.calls.length).toBeGreaterThan(1);
  });

  it('ignores yearly archives even when they are the only links present', async () => {
    const page = fakePage({
      frames: [
        frame(
          LISTING_URL,
          `<a href="https://example.gov.au/__psi/yearly/2026.zip">2026</a>`,
        ),
      ],
    });

    await expect(
      service().discoverArchiveCandidates(page, NO_SETTLE),
    ).rejects.toMatchObject({
      code: 'DISCOVERY_NO_CANDIDATES',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ZIP validation
// ─────────────────────────────────────────────────────────────────────────

describe('assertDownloadedZip', () => {
  const URL_UNDER_TEST = 'https://example.gov.au/__psi/weekly/20260727.zip';

  let dir: string;
  let target: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'psi-zip-validator-'));
    target = join(dir, 'downloaded.zip');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /** Digest computed independently of the implementation under test. */
  function sha256Of(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  it('accepts a real ZIP, reporting its size, digest and entry count', async () => {
    const zip = buildZip([
      { name: 'A.DAT', content: 'a' },
      { name: 'B.DAT', content: 'b' },
    ]);
    await writeFile(target, zip);

    const result = await assertDownloadedZip(target, URL_UNDER_TEST);

    expect(result.bytes).toBe(zip.length);
    expect(result.sha256).toBe(sha256Of(zip));
    expect(result.entryCount).toBe(2);
  });

  it('rejects an HTML challenge disguised as a ZIP with DOWNLOAD_BLOCKED', async () => {
    const challenge =
      '<!DOCTYPE html><html><head><title>Just a moment...</title></head>' +
      '<body>Checking your browser before accessing the site.</body></html>';
    await writeFile(target, challenge, 'utf8');

    await expect(
      assertDownloadedZip(target, URL_UNDER_TEST),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_BLOCKED' });
  });

  it('recognises an HTML body that leads with a BOM or whitespace', async () => {
    await writeFile(
      target,
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('\n  <html><body>nope</body></html>'),
      ]),
    );

    await expect(
      assertDownloadedZip(target, URL_UNDER_TEST),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_BLOCKED' });
  });

  it('rejects a non-ZIP, non-HTML body as DOWNLOAD_FAILED, not as a challenge', async () => {
    await writeFile(target, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]));

    await expect(
      assertDownloadedZip(target, URL_UNDER_TEST),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
  });

  it('rejects an empty file', async () => {
    await writeFile(target, Buffer.alloc(0));

    await expect(
      assertDownloadedZip(target, URL_UNDER_TEST),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
  });

  it('rejects a truncated archive that still carries a valid ZIP signature', async () => {
    const zip = buildSimpleZip('A.DAT', 'some content here');
    const truncated = zip.subarray(0, zip.length - 24);
    expect(truncated.subarray(0, 4).toString('hex')).toBe('504b0304');
    await writeFile(target, truncated);

    await expect(
      assertDownloadedZip(target, URL_UNDER_TEST),
    ).rejects.toMatchObject({ code: 'ARCHIVE_UNREADABLE' });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// downloadViaBrowser
// ─────────────────────────────────────────────────────────────────────────

describe('downloadViaBrowser', () => {
  const URL_UNDER_TEST = 'https://example.gov.au/__psi/weekly/20260727.zip';
  const GUID = 'fake-download-guid-0001';
  const OPTIONS: BrowserDownloadOptions = {
    timeoutMs: 10_000,
    maxBytes: 1024 * 1024,
  };

  let dir: string;
  let destination: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'psi-browser-download-'));
    destination = join(dir, 'downloaded.zip');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  interface Scenario {
    /** Bytes Chrome "downloads" to its GUID-named file, or null for no download at all. */
    readonly body: Buffer | null;
    /** Status the navigation renders, or null when it aborts into a download. */
    readonly renderedStatus: number | null;
    readonly responseHeaders?: Record<string, string>;
  }

  /**
   * Builds a fake Browser whose `goto` reproduces one scenario: Chrome
   * either aborts the navigation because it became a download (emitting the
   * CDP progress events and writing the file), or renders a document instead.
   */
  function fakeBrowser(scenario: Scenario): PuppeteerBrowser {
    const client = new EventEmitter() as EventEmitter & {
      send: (method: string, params?: unknown) => Promise<unknown>;
      detach: () => Promise<void>;
    };
    client.send = () => Promise.resolve({});
    client.detach = () => Promise.resolve();

    const page = new EventEmitter() as EventEmitter & {
      goto: (
        url: string,
        options?: unknown,
      ) => Promise<{ status: () => number | null } | null>;
      close: () => Promise<void>;
    };

    page.goto = async (url: string) => {
      if (scenario.responseHeaders) {
        page.emit('response', {
          url: () => url,
          headers: () => scenario.responseHeaders,
        });
      }

      if (scenario.body !== null) {
        await writeFile(join(dir, GUID), scenario.body);
        client.emit('Browser.downloadWillBegin', { guid: GUID, url });
        client.emit('Browser.downloadProgress', {
          guid: GUID,
          state: 'completed',
          totalBytes: scenario.body.length,
          receivedBytes: scenario.body.length,
        });
        throw new Error('net::ERR_ABORTED at ' + url);
      }

      return { status: () => scenario.renderedStatus };
    };
    page.close = () => Promise.resolve();

    return {
      target: () => ({ createCDPSession: () => Promise.resolve(client) }),
      newPage: () => Promise.resolve(page),
    } as unknown as PuppeteerBrowser;
  }

  it('validates before renaming, leaving the archive at the destination and no .part', async () => {
    const zip = buildSimpleZip('A.DAT', 'sale records');
    const browser = fakeBrowser({ body: zip, renderedStatus: null });

    const result = await downloadViaBrowser(
      browser,
      URL_UNDER_TEST,
      destination,
      OPTIONS,
    );

    expect(result.bytes).toBe(zip.length);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.entryCount).toBe(1);
    expect(await exists(destination)).toBe(true);
    expect(await exists(`${destination}.part`)).toBe(false);
    expect(await readdir(dir)).toEqual(['downloaded.zip']);
  });

  it('reports DOWNLOAD_BLOCKED when the response carries cf-mitigated: challenge', async () => {
    const browser = fakeBrowser({
      body: null,
      renderedStatus: 403,
      responseHeaders: {
        'cf-mitigated': 'challenge',
        'content-type': 'text/html',
      },
    });

    await expect(
      downloadViaBrowser(browser, URL_UNDER_TEST, destination, OPTIONS),
    ).rejects.toMatchObject({
      code: 'DOWNLOAD_BLOCKED',
    });
    expect(await exists(destination)).toBe(false);
    expect(await exists(`${destination}.part`)).toBe(false);
  });

  it('cleans up the partial file when a downloaded challenge page fails validation', async () => {
    const challenge = Buffer.from(
      '<!DOCTYPE html><title>Just a moment...</title>',
    );
    const browser = fakeBrowser({ body: challenge, renderedStatus: null });

    await expect(
      downloadViaBrowser(browser, URL_UNDER_TEST, destination, OPTIONS),
    ).rejects.toMatchObject({
      code: 'DOWNLOAD_BLOCKED',
    });
    expect(await exists(destination)).toBe(false);
    expect(await exists(`${destination}.part`)).toBe(false);
    expect(await readdir(dir)).toEqual([]);
  });

  it('cleans up the partial file when a truncated archive fails validation', async () => {
    const zip = buildSimpleZip('A.DAT', 'sale records');
    const browser = fakeBrowser({
      body: zip.subarray(0, zip.length - 24),
      renderedStatus: null,
    });

    await expect(
      downloadViaBrowser(browser, URL_UNDER_TEST, destination, OPTIONS),
    ).rejects.toMatchObject({
      code: 'ARCHIVE_UNREADABLE',
    });
    expect(await readdir(dir)).toEqual([]);
  });

  it('reports DOWNLOAD_FAILED when a page is rendered with no challenge marker', async () => {
    const browser = fakeBrowser({ body: null, renderedStatus: 200 });

    await expect(
      downloadViaBrowser(browser, URL_UNDER_TEST, destination, OPTIONS),
    ).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
    });
    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses an oversized download without leaving anything behind', async () => {
    const zip = buildSimpleZip('A.DAT', 'x'.repeat(2048));
    const browser = fakeBrowser({ body: zip, renderedStatus: null });

    await expect(
      downloadViaBrowser(browser, URL_UNDER_TEST, destination, {
        timeoutMs: 10_000,
        maxBytes: 64,
      }),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_TOO_LARGE' });
    expect(await exists(destination)).toBe(false);
    expect(await readdir(dir)).toEqual([]);
  });
});
