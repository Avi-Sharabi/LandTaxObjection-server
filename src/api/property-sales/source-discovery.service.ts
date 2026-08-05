import { Injectable, Logger } from '@nestjs/common';
import type { Page as PuppeteerPage } from 'puppeteer';

import { assertAllowedDownloadUrl } from './archive-download';
import type { ArchiveCandidate } from './archive-selection.util';
import { SourceDiscoveryException } from './exceptions/source-discovery.exception';
import { PropertySalesConfig } from './property-sales.config';

interface DiscoveryFrame {
  url(): string;

  queryLinks(selector: string): Promise<readonly string[]>;
}

interface DiscoveryPage {
  goto(
    url: string,
    options: { waitUntil: 'networkidle2'; timeout: number },
  ): Promise<{ status: number | null }>;
  title(): Promise<string>;
  url(): string;

  frames(): DiscoveryFrame[];
}

export function wrapPage(page: PuppeteerPage): DiscoveryPage {
  return {
    goto: async (url, options) => {
      const response = await page.goto(url, options);
      return { status: response?.status() ?? null };
    },
    title: () => page.title(),
    url: () => page.url(),
    frames: () =>
      page.frames().map((frame) => ({
        url: () => frame.url(),
        queryLinks: (selector: string) =>
          frame.$$eval(selector, (elements) =>
            elements.map(
              (element) => (element as HTMLAnchorElement).href ?? '',
            ),
          ),
      })),
  };
}

function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!isValidCalendarDate(year, month, day)) return null;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

const FILENAME_DATE_PATTERN = /(\d{4})(\d{2})(\d{2})\.zip$/i;

function parseFilenameReleaseDate(pathname: string): string | null {
  const match = FILENAME_DATE_PATTERN.exec(pathname);
  if (match === null) return null;

  return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function toCandidates(
  hrefs: readonly string[],
  linkPattern: RegExp,
): ArchiveCandidate[] {
  const candidates: ArchiveCandidate[] = [];

  for (const href of hrefs) {
    if (href === '') continue;

    let resolved: URL;
    try {
      resolved = new URL(href);
    } catch {
      continue;
    }

    if (
      !linkPattern.test(resolved.pathname) &&
      !linkPattern.test(resolved.href)
    )
      continue;

    const releaseDate = parseFilenameReleaseDate(resolved.pathname);
    if (releaseDate === null) continue;

    candidates.push({ url: resolved.href, releaseDate });
  }

  return candidates;
}

function sortCandidatesNewestFirst(
  candidates: readonly ArchiveCandidate[],
): ArchiveCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.releaseDate !== b.releaseDate)
      return a.releaseDate < b.releaseDate ? 1 : -1;
    return a.url < b.url ? 1 : a.url > b.url ? -1 : 0;
  });
}

function dedupeCandidates(
  candidates: readonly ArchiveCandidate[],
): ArchiveCandidate[] {
  const seen = new Set<string>();
  const unique: ArchiveCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    unique.push(candidate);
  }
  return unique;
}

const CHALLENGE_HOST = 'challenges.cloudflare.com';

const CHALLENGE_TITLES = [
  'just a moment',
  'attention required',
  'checking your browser',
];

const SETTLE_BUDGET_MS = 15_000;
const SETTLE_POLL_MS = 2_500;

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

@Injectable()
export class SourceDiscoveryService {
  private readonly logger = new Logger(SourceDiscoveryService.name);

  constructor(private readonly config: PropertySalesConfig) {}

  private logEvent(context: string, data: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({ context, ...data, ts: new Date().toISOString() }),
    );
  }

  private async looksChallenged(page: DiscoveryPage): Promise<boolean> {
    if (page.frames().some((frame) => frame.url().includes(CHALLENGE_HOST)))
      return true;

    const title = (await page.title()).trim().toLowerCase();
    return CHALLENGE_TITLES.some((candidate) => title.startsWith(candidate));
  }

  private async collectCandidates(
    page: DiscoveryPage,
    linkPattern: RegExp,
  ): Promise<ArchiveCandidate[]> {
    const found: ArchiveCandidate[] = [];

    for (const frame of page.frames()) {
      const frameUrl = frame.url();
      if (frameUrl.startsWith('about:') || frameUrl.includes(CHALLENGE_HOST))
        continue;

      let hrefs: readonly string[];
      try {
        hrefs = await frame.queryLinks(this.config.weeklyLinkSelector);
      } catch (err) {
        this.logger.debug(
          JSON.stringify({
            context: 'SourceDiscovery.skippedUnreadableFrame',
            frameUrl,
            reason: err instanceof Error ? err.message : String(err),
          }),
        );
        continue;
      }

      found.push(...toCandidates(hrefs, linkPattern));
    }

    return dedupeCandidates(found);
  }

  async discoverArchiveCandidates(
    page: DiscoveryPage,
  ): Promise<ArchiveCandidate[]> {
    const linkPattern = this.config.weeklyLinkPattern;

    const { status } = await page.goto(this.config.discoveryUrl, {
      waitUntil: 'networkidle2',
      timeout: this.config.browserTimeoutMs,
    });

    let candidates = await this.collectCandidates(page, linkPattern);

    for (
      let waited = 0;
      candidates.length === 0 && waited < SETTLE_BUDGET_MS;
      waited += SETTLE_POLL_MS
    ) {
      if (await this.looksChallenged(page)) {
        this.logEvent('SourceDiscovery.stillChallenged', { waited });
      } else {
        this.logEvent('SourceDiscovery.noCandidatesYet', { waited });
      }
      await delay(SETTLE_POLL_MS);
      candidates = await this.collectCandidates(page, linkPattern);
    }

    if (candidates.length === 0) {
      if (await this.looksChallenged(page)) {
        throw new SourceDiscoveryException(
          `${this.config.discoveryUrl} served a bot-check interstitial instead of the listing (status ${status ?? 'unknown'}). ` +
            'Confirm PSI_HEADLESS and stealth configuration before retrying.',
          {
            context: {
              url: this.config.discoveryUrl,
              status,
              headless: this.config.headless,
            },
          },
        );
      }

      throw new SourceDiscoveryException(
        `No weekly archive links found on ${this.config.discoveryUrl} using selector "${this.config.weeklyLinkSelector}" and pattern ${linkPattern.source} (initial response status ${status ?? 'unknown'}). ` +
          'The page shows no live bot-check signal, so its structure has probably changed — verify PSI_WEEKLY_LINK_SELECTOR first, then PSI_DISCOVERY_URL and PSI_WEEKLY_LINK_PATTERN, against the live page.',
        {
          context: {
            url: this.config.discoveryUrl,
            selector: this.config.weeklyLinkSelector,
            pattern: linkPattern.source,
            status,
          },
        },
      );
    }

    const sorted = sortCandidatesNewestFirst(candidates);

    const allowed: ArchiveCandidate[] = [];
    for (const candidate of sorted) {
      try {
        assertAllowedDownloadUrl(
          candidate.url,
          this.config.allowedDownloadHosts,
        );
        allowed.push(candidate);
      } catch (err) {
        this.logger.warn(
          JSON.stringify({
            context: 'SourceDiscovery.excludedDisallowedHost',
            url: candidate.url,
            reason: err instanceof Error ? err.message : String(err),
            ts: new Date().toISOString(),
          }),
        );
      }
    }

    if (allowed.length === 0) {
      throw new SourceDiscoveryException(
        `Every candidate found on ${this.config.discoveryUrl} was on a host outside the configured allowlist`,
        {
          context: {
            url: this.config.discoveryUrl,
            candidateCount: sorted.length,
          },
        },
      );
    }

    this.logEvent('SourceDiscovery.discovered', {
      candidateCount: allowed.length,
      newest: allowed[0]?.releaseDate,
      oldest: allowed[allowed.length - 1]?.releaseDate,
    });

    return allowed;
  }
}
