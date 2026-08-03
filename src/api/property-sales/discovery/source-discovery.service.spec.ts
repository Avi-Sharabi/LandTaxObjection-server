import { SourceDiscoveryService, type SettleOptions } from './source-discovery.service';
import type { DiscoveryFrame, DiscoveryPage } from './discovery-page.types';
import type { PropertySalesConfig } from '../property-sales.config';
import {
  BULK_PSI_WEEKLY_HTML,
  CLOUDFLARE_CHALLENGE_HTML,
  PORTAL_ENTRY_NO_LINKS_HTML,
} from '../__testing__/discovery-html.fixture';

const LISTING_URL = 'https://www.valuergeneral.nsw.gov.au/design/bulk_psi_content/bulk_psi';

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

function service(config: Partial<PropertySalesConfig> = {}): SourceDiscoveryService {
  return new SourceDiscoveryService({ ...BASE_CONFIG, ...config } as PropertySalesConfig);
}

describe('discoverArchiveCandidates', () => {
  it('returns every weekly archive candidate, newest first', async () => {
    const page = fakePage({ frames: [frame(LISTING_URL, BULK_PSI_WEEKLY_HTML)] });

    const found = await service().discoverArchiveCandidates(page, NO_SETTLE);

    expect(found.map((c) => c.releaseDate)).toEqual(['2026-07-27', '2026-07-20', '2026-07-13']);
    expect(found[0]?.url).toBe('https://example.gov.au/__psi/weekly/20260727.zip');
    expect(found[0]?.label).toBe('27 Jul 2026');
    expect(found[0]?.dateSource).toBe('filename');
  });

  it('navigates to the configured discovery URL', async () => {
    const page = fakePage({ frames: [frame(LISTING_URL, BULK_PSI_WEEKLY_HTML)] });

    await service().discoverArchiveCandidates(page, NO_SETTLE);

    expect(page.goto).toHaveBeenCalledWith(LISTING_URL, {
      waitUntil: 'networkidle2',
      timeout: 5000,
    });
  });

  it('does not override the browser User-Agent, which is what gets a session blocked', async () => {
    const page = fakePage({ frames: [frame(LISTING_URL, BULK_PSI_WEEKLY_HTML)] });

    await service().discoverArchiveCandidates(page, NO_SETTLE);

    // The seam has no setUserAgent at all: assert the shape stays that way,
    // so reintroducing a bot UA on the discovery page is a compile/test failure.
    expect(page).not.toHaveProperty('setUserAgent');
  });

  it('finds a listing served inside a child frame', async () => {
    const page = fakePage({
      frames: [
        frame(LISTING_URL, '<h1>Bulk PSI</h1><iframe src="./listing"></iframe>'),
        frame('https://www.valuergeneral.nsw.gov.au/listing', BULK_PSI_WEEKLY_HTML),
      ],
    });

    const found = await service().discoverArchiveCandidates(page, NO_SETTLE);

    expect(found[0]?.releaseDate).toBe('2026-07-27');
  });

  it('skips about: frames and an unreadable frame without failing the pass', async () => {
    const unreadable: DiscoveryFrame = {
      url: () => 'https://www.valuergeneral.nsw.gov.au/other',
      content: jest.fn().mockRejectedValue(new Error('detached frame')),
    };
    const page = fakePage({
      frames: [frame('about:blank', ''), unreadable, frame(LISTING_URL, BULK_PSI_WEEKLY_HTML)],
    });

    const found = await service().discoverArchiveCandidates(page, NO_SETTLE);

    expect(found[0]?.releaseDate).toBe('2026-07-27');
    expect(unreadable.content).toHaveBeenCalled();
  });

  it('deduplicates a link that appears in more than one frame', async () => {
    const single = `<a href="/__psi/weekly/20260727.zip">27 Jul 2026</a>`;
    const page = fakePage({
      frames: [frame('https://example.gov.au/a', single), frame('https://example.gov.au/b', single)],
    });

    const found = await service().discoverArchiveCandidates(page, NO_SETTLE);
    expect(found).toHaveLength(1);
    expect(found[0]?.url).toBe('https://example.gov.au/__psi/weekly/20260727.zip');
  });

  it('throws DISCOVERY_NO_CANDIDATES when the page loads normally but has no links', async () => {
    const page = fakePage({ frames: [frame(LISTING_URL, PORTAL_ENTRY_NO_LINKS_HTML)] });

    await expect(service().discoverArchiveCandidates(page, NO_SETTLE)).rejects.toMatchObject({
      code: 'DISCOVERY_NO_CANDIDATES',
    });
  });

  it('throws DISCOVERY_BLOCKED, not NO_CANDIDATES, on a 403 interstitial', async () => {
    const page = fakePage({
      frames: [frame(LISTING_URL, CLOUDFLARE_CHALLENGE_HTML)],
      status: 403,
      title: 'Just a moment...',
    });

    await expect(service().discoverArchiveCandidates(page, NO_SETTLE)).rejects.toMatchObject({
      code: 'DISCOVERY_BLOCKED',
    });
  });

  it('detects a challenge from the page title even on a 200 response', async () => {
    const page = fakePage({
      frames: [frame(LISTING_URL, CLOUDFLARE_CHALLENGE_HTML)],
      status: 200,
      title: 'Just a moment...',
    });

    await expect(service().discoverArchiveCandidates(page, NO_SETTLE)).rejects.toMatchObject({
      code: 'DISCOVERY_BLOCKED',
    });
  });

  it('detects a challenge from a Cloudflare frame URL', async () => {
    const page = fakePage({
      frames: [
        frame(LISTING_URL, '<p>nothing here</p>'),
        frame('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x', ''),
      ],
      status: 200,
      title: 'Bulk PSI',
    });

    await expect(service().discoverArchiveCandidates(page, NO_SETTLE)).rejects.toMatchObject({
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
    expect(found[0]?.url).toBe('https://example.gov.au/__psi/weekly/20260720.zip');
  });

  it('throws DISCOVERY_NO_CANDIDATES when every candidate is on a disallowed host', async () => {
    const page = fakePage({
      frames: [frame(LISTING_URL, `<a href="https://evil.test/__psi/weekly/20260727.zip">27 Jul 2026</a>`)],
    });

    await expect(service().discoverArchiveCandidates(page, NO_SETTLE)).rejects.toMatchObject({
      code: 'DISCOVERY_NO_CANDIDATES',
    });
  });

  it('re-reads the page while it settles, then succeeds', async () => {
    const content = jest
      .fn()
      .mockResolvedValueOnce(CLOUDFLARE_CHALLENGE_HTML) // first pass: still challenged
      .mockResolvedValue(BULK_PSI_WEEKLY_HTML); // after settling: the real listing
    const page = fakePage({ frames: [{ url: () => LISTING_URL, content }] });

    const found = await service().discoverArchiveCandidates(page, { budgetMs: 10, pollMs: 1 });

    expect(found[0]?.releaseDate).toBe('2026-07-27');
    expect(content.mock.calls.length).toBeGreaterThan(1);
  });

  it('ignores yearly archives even when they are the only links present', async () => {
    const page = fakePage({
      frames: [frame(LISTING_URL, `<a href="https://example.gov.au/__psi/yearly/2026.zip">2026</a>`)],
    });

    await expect(service().discoverArchiveCandidates(page, NO_SETTLE)).rejects.toMatchObject({
      code: 'DISCOVERY_NO_CANDIDATES',
    });
  });
});
