/**
 * Drives a real browser page to find weekly archive links on the NSW
 * Valuer General's bulk Property Sales Information page.
 *
 * Two things about the live source shape this module, both established by
 * direct observation (and reconfirmed by KAN-241's own Phase 0 feasibility
 * spike against the live page):
 *
 * 1. The listing is a plain HTML page of absolute `.zip` links — no portal
 *    JavaScript, no login. Weekly archives sit under `/__psi/weekly/` and
 *    yearly ones under `/__psi/yearly/`, so the configured link pattern is
 *    what separates them.
 * 2. The page is behind Cloudflare. A plain headless browser is served
 *    `403` with a `Just a moment...` interstitial; headless + stealth (this
 *    module's only supported configuration — see PsiBrowserService) is
 *    served the real page. Nothing here attempts to defeat a challenge: a
 *    page that stays challenged fails with `DISCOVERY_BLOCKED`.
 *
 * Ported from nsw-property-sales-poc/src/discovery/source-discovery.ts
 * (KAN-241), keeping the `DiscoveryPage`/`DiscoveryFrame` structural typing,
 * `looksChallenged`, `collectCandidates`, and the settle-loop — the whole
 * point of that shape, unit-testability with hand-written fakes, carries
 * over unchanged. Two deliberate behaviour changes, both required for
 * catch-up (the POC only ever needed the single newest link for
 * `run --latest`):
 *
 *  1. Returns every candidate, newest first, instead of picking one.
 *  2. A candidate whose host fails the SSRF allowlist is logged and
 *     EXCLUDED rather than aborting the whole discovery pass — one
 *     unexpected/off-domain link must not block every other week's
 *     catch-up. The download step re-validates every URL immediately
 *     before fetching it regardless (browser-downloader.util.ts's own
 *     header comment), so this exclusion is a pre-filter, not the only
 *     enforcement point.
 */

import { Injectable, Logger } from '@nestjs/common';

import { assertAllowedDownloadUrl } from '../download/url-guard.util';
import { PropertySalesIngestionException } from '../exceptions/property-sales-ingestion.exception';
import { PropertySalesConfig } from '../property-sales.config';
import {
  dedupeCandidates,
  extractCandidateArchiveLinks,
  sortCandidatesNewestFirst,
  type ArchiveCandidate,
} from './link-extractor.util';
import type { DiscoveryPage } from './discovery-page.types';

/** Hosts that serve bot-check interstitials rather than the requested page. */
const CHALLENGE_HOST = 'challenges.cloudflare.com';

/** Interstitial titles, lowercased. Cloudflare's is "Just a moment...". */
const CHALLENGE_TITLES = ['just a moment', 'attention required', 'checking your browser'];

/**
 * How long to keep re-reading the page before accepting that it has no
 * links. Injectable per call so unit tests need not spend the real budget
 * waiting.
 */
export interface SettleOptions {
  readonly budgetMs: number;
  readonly pollMs: number;
}

const DEFAULT_SETTLE: SettleOptions = { budgetMs: 15_000, pollMs: 2_500 };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class SourceDiscoveryService {
  private readonly logger = new Logger(SourceDiscoveryService.name);

  constructor(private readonly config: PropertySalesConfig) {}

  private logEvent(context: string, data: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ context, ...data, ts: new Date().toISOString() }));
  }

  /**
   * True when the document we're looking at is a bot-check interstitial
   * rather than the listing. Distinguishing this from "the page loaded but
   * had no links" is the difference between an actionable error and a
   * misleading one.
   */
  private async looksChallenged(page: DiscoveryPage, status: number | null): Promise<boolean> {
    if (status === 403 || status === 503) return true;
    if (page.frames().some((frame) => frame.url().includes(CHALLENGE_HOST))) return true;

    const title = (await page.title()).trim().toLowerCase();
    return CHALLENGE_TITLES.some((candidate) => title.startsWith(candidate));
  }

  /**
   * Collects candidates from the main document and every child frame, so a
   * listing served inside an iframe is still found. Frames that cannot be
   * read (cross-origin, or torn down mid-read) are skipped rather than
   * fatal — the interesting content may well be in a sibling frame.
   */
  private async collectCandidates(page: DiscoveryPage, linkPattern: RegExp): Promise<ArchiveCandidate[]> {
    const found: ArchiveCandidate[] = [];

    for (const frame of page.frames()) {
      const frameUrl = frame.url();
      if (frameUrl.startsWith('about:') || frameUrl.includes(CHALLENGE_HOST)) continue;

      let html: string;
      try {
        html = await frame.content();
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

      found.push(...extractCandidateArchiveLinks(html, linkPattern, frameUrl));
    }

    return dedupeCandidates(found);
  }

  /**
   * Loads the discovery page and returns every weekly archive candidate
   * found, newest first, already filtered to hosts on the configured
   * allowlist.
   *
   * The page is given a bounded settling budget before "no links" is
   * treated as final, because a Cloudflare interstitial can still be
   * resolving when `networkidle2` fires.
   */
  async discoverArchiveCandidates(
    page: DiscoveryPage,
    settle: SettleOptions = DEFAULT_SETTLE,
  ): Promise<ArchiveCandidate[]> {
    const linkPattern = this.config.weeklyLinkPattern;

    // The browser's genuine User-Agent is deliberately left in place — see
    // PsiBrowserService and DiscoveryPage's own doc comment.
    const { status } = await page.goto(this.config.discoveryUrl, {
      waitUntil: 'networkidle2',
      timeout: this.config.browserTimeoutMs,
    });

    let candidates = await this.collectCandidates(page, linkPattern);

    for (
      let waited = 0;
      candidates.length === 0 && waited < settle.budgetMs;
      waited += settle.pollMs
    ) {
      if (await this.looksChallenged(page, status)) {
        this.logEvent('SourceDiscovery.stillChallenged', { waited });
      } else {
        this.logEvent('SourceDiscovery.noCandidatesYet', { waited });
      }
      await delay(settle.pollMs);
      candidates = await this.collectCandidates(page, linkPattern);
    }

    if (candidates.length === 0) {
      if (await this.looksChallenged(page, status)) {
        throw new PropertySalesIngestionException(
          'DISCOVERY_BLOCKED',
          `${this.config.discoveryUrl} served a bot-check interstitial instead of the listing (status ${status ?? 'unknown'}). ` +
            'Confirm PSI_HEADLESS and stealth configuration (see README § Known limitations) before retrying.',
          { context: { url: this.config.discoveryUrl, status, headless: this.config.headless } },
        );
      }

      throw new PropertySalesIngestionException(
        'DISCOVERY_NO_CANDIDATES',
        `No weekly archive links found on ${this.config.discoveryUrl} matching pattern ${linkPattern.source}. ` +
          'The page loaded normally, so its structure has probably changed — verify PSI_DISCOVERY_URL and PSI_WEEKLY_LINK_PATTERN against the live page.',
        { context: { url: this.config.discoveryUrl, pattern: linkPattern.source, status } },
      );
    }

    const sorted = sortCandidatesNewestFirst(candidates);

    const allowed: ArchiveCandidate[] = [];
    for (const candidate of sorted) {
      try {
        assertAllowedDownloadUrl(candidate.url, this.config.allowedDownloadHosts);
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
      throw new PropertySalesIngestionException(
        'DISCOVERY_NO_CANDIDATES',
        `Every candidate found on ${this.config.discoveryUrl} was on a host outside the configured allowlist`,
        { context: { url: this.config.discoveryUrl, candidateCount: sorted.length } },
      );
    }

    for (const candidate of allowed) {
      if (candidate.dateMismatch) {
        this.logger.warn(
          JSON.stringify({
            context: 'SourceDiscovery.dateMismatch',
            url: candidate.url,
            label: candidate.label,
            releaseDate: candidate.releaseDate,
            ts: new Date().toISOString(),
          }),
        );
      }
    }

    this.logEvent('SourceDiscovery.discovered', {
      candidateCount: allowed.length,
      newest: allowed[0]?.releaseDate,
      oldest: allowed[allowed.length - 1]?.releaseDate,
    });

    return allowed;
  }
}
