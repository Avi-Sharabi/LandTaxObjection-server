import { Injectable, Logger } from '@nestjs/common';
import type { Page as PuppeteerPage } from 'puppeteer';

import {
  dedupeCandidates,
  sortCandidatesNewestFirst,
  toCandidates,
} from './archive-candidate.util';
import type { ArchiveCandidate } from './archive-selection.util';
import { assertAllowedDownloadUrl } from './download-url-allowlist.util';
import { SourceDiscoveryException } from './exceptions/source-discovery.exception';
import { logEvent } from './property-sales-log.util';
import {
  ALLOWED_DOWNLOAD_HOSTS,
  BROWSER_TIMEOUT_MS,
  HEADLESS,
} from './property-sales.constants';

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

const DISCOVERY_URL =
  'https://www.valuergeneral.nsw.gov.au/design/bulk_psi_content/bulk_psi';
const WEEKLY_LINK_SELECTOR = 'div.panel-body.weekly a';
const WEEKLY_LINK_PATTERN = /^\/__psi\/weekly\/\d{8}\.zip$/i;

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
        hrefs = await frame.queryLinks(WEEKLY_LINK_SELECTOR);
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
    const linkPattern = WEEKLY_LINK_PATTERN;

    const { status } = await page.goto(DISCOVERY_URL, {
      waitUntil: 'networkidle2',
      timeout: BROWSER_TIMEOUT_MS,
    });

    let candidates = await this.collectCandidates(page, linkPattern);

    for (
      let waited = 0;
      candidates.length === 0 && waited < SETTLE_BUDGET_MS;
      waited += SETTLE_POLL_MS
    ) {
      if (await this.looksChallenged(page)) {
        logEvent(this.logger, 'SourceDiscovery.stillChallenged', { waited });
      } else {
        logEvent(this.logger, 'SourceDiscovery.noCandidatesYet', { waited });
      }
      await delay(SETTLE_POLL_MS);
      candidates = await this.collectCandidates(page, linkPattern);
    }

    if (candidates.length === 0) {
      if (await this.looksChallenged(page)) {
        throw new SourceDiscoveryException(
          `${DISCOVERY_URL} served a bot-check interstitial instead of the listing (status ${status ?? 'unknown'}). ` +
            'Confirm HEADLESS and stealth configuration in property-sales.constants.ts before retrying.',
          {
            context: {
              url: DISCOVERY_URL,
              status,
              headless: HEADLESS,
            },
          },
        );
      }

      throw new SourceDiscoveryException(
        `No weekly archive links found on ${DISCOVERY_URL} using selector "${WEEKLY_LINK_SELECTOR}" and pattern ${linkPattern.source} (initial response status ${status ?? 'unknown'}). ` +
          'The page shows no live bot-check signal, so its structure has probably changed — verify WEEKLY_LINK_SELECTOR in property-sales.constants.ts first, then DISCOVERY_URL and WEEKLY_LINK_PATTERN, against the live page.',
        {
          context: {
            url: DISCOVERY_URL,
            selector: WEEKLY_LINK_SELECTOR,
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
        assertAllowedDownloadUrl(candidate.url, ALLOWED_DOWNLOAD_HOSTS);
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
        `Every candidate found on ${DISCOVERY_URL} was on a host outside the configured allowlist`,
        {
          context: {
            url: DISCOVERY_URL,
            candidateCount: sorted.length,
          },
        },
      );
    }

    logEvent(this.logger, 'SourceDiscovery.discovered', {
      candidateCount: allowed.length,
      newest: allowed[0]?.releaseDate,
      oldest: allowed[allowed.length - 1]?.releaseDate,
    });

    return allowed;
  }
}
