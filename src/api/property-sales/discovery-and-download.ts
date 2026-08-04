/**
 * Box 3 of the pipeline — "download the file using puppeteer" — in one
 * file: find every advertised weekly archive on the NSW Valuer General's
 * bulk Property Sales Information page, then fetch the bytes.
 *
 * Consolidated from 8 previously-separate files (all ported from
 * nsw-property-sales-poc, itself the reference implementation this logic
 * came from — nothing here is new puppeteer code written for this ticket):
 * discovery-page.types.ts, release-date.util.ts, link-extractor.util.ts,
 * url-guard.util.ts, source-discovery.service.ts, psi-browser.service.ts,
 * zip-validator.util.ts, browser-downloader.util.ts. One file per pipeline
 * box, not one file per class/function — the previous split was useful
 * while porting piece by piece, but this is one cohesive concern: get bytes
 * off a Cloudflare-protected government site into local temp storage.
 *
 * The two load-bearing facts this file exists to handle, both established
 * by direct observation against the live site:
 *
 * 1. The listing is a plain HTML page of absolute `.zip` links — no portal
 *    JavaScript, no login. Weekly archives sit under `/__psi/weekly/` and
 *    yearly ones under `/__psi/yearly/`, so the configured link pattern is
 *    what separates them.
 * 2. The page is behind Cloudflare, and the `.zip` endpoint is challenged
 *    SEPARATELY from the listing page — a session that already loaded the
 *    listing can still get `403 cf-mitigated: challenge` fetching the
 *    archive. Only `puppeteer-extra-plugin-stealth` reaches the real page in
 *    both cases; nothing here attempts to defeat a challenge beyond that —
 *    a page or download that stays challenged fails loudly
 *    (DISCOVERY_BLOCKED / DOWNLOAD_BLOCKED) rather than retrying tricks.
 */

import { rename, stat, unlink, open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type {
  Browser as PuppeteerBrowser,
  Page as PuppeteerPage,
} from 'puppeteer';

import { assertArchiveReadable, sha256File } from './archive-extractor';
import { PropertySalesIngestionException } from './exceptions';
import { PropertySalesConfig } from './property-sales.config';

// ─────────────────────────────────────────────────────────────────────────
// Discovery page types — a narrow structural subset of Puppeteer's real
// Page/Frame types, so SourceDiscoveryService is fully unit-testable with
// hand-written fakes over saved HTML fixtures, independent of an actual
// browser or network access.
// ─────────────────────────────────────────────────────────────────────────

/** A document within the page — the main frame or any child frame. */
export interface DiscoveryFrame {
  url(): string;
  content(): Promise<string>;
}

export interface DiscoveryPage {
  goto(
    url: string,
    options: { waitUntil: 'networkidle2'; timeout: number },
  ): Promise<{ status: number | null }>;
  title(): Promise<string>;
  url(): string;
  /** Includes the main frame first, matching Puppeteer's own ordering. */
  frames(): DiscoveryFrame[];
}

/**
 * Adapts a real Puppeteer `Page` to the narrow `DiscoveryPage` contract.
 * Required, not merely convenient: Puppeteer's real `page.goto()` resolves
 * `HTTPResponse | null`, which is not structurally assignable to
 * `{ status: number | null }` — the object shape our discovery logic
 * actually needs — so this adapter is what bridges the two.
 *
 * Deliberately exposes nothing beyond `goto`/`title`/`url`/`frames` — in
 * particular no `setUserAgent`: the browser's genuine User-Agent must stay
 * untouched (see PsiBrowserService below), and narrowing the type here
 * makes an accidental override a compile error, not just a policy someone
 * has to remember.
 */
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
        content: () => frame.content(),
      })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Release date parsing — pure, no I/O. Two independent sources, because the
// live listing carries both and they guard each other: the filename
// (/__psi/weekly/20260727.zip) is canonical and machine-generated, while the
// visible label (27 Jul 2026) is what a human reads off the page. The
// filename wins when both parse; the label is the fallback if the naming
// convention ever changes, and a cross-check otherwise. Everything returns
// null rather than throwing — this runs against a page this project does
// not control, and one malformed row must not fail a whole discovery pass.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Months as they appear on the NSW listing, indexed from 1. Accepts both the
 * abbreviated (`Jul`) and full (`July`) forms; `sept` is included because it
 * appears in the wild alongside `sep`.
 */
const MONTHS: Readonly<Record<string, number>> = Object.freeze({
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
});

/**
 * Rejects impossible calendar dates (31 Feb, 30 Feb in a non-leap year) by
 * round-tripping through `Date.UTC` and checking the components survive.
 */
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

/** Formats validated components as `YYYY-MM-DD`, or `null` if not a real date. */
function toIsoDate(year: number, month: number, day: number): string | null {
  if (!isValidCalendarDate(year, month, day)) return null;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Matches a `YYYYMMDD` stem in the last path segment, e.g. `.../20260727.zip`. */
const FILENAME_DATE_PATTERN = /(\d{4})(\d{2})(\d{2})\.zip$/i;

/**
 * Reads the release date out of a weekly archive URL's filename.
 * Returns `YYYY-MM-DD`, or `null` if the filename carries no valid date —
 * which is what excludes `/__psi/yearly/1990.zip` from weekly selection.
 */
export function parseFilenameReleaseDate(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url; // Tolerate a bare path; the pattern is anchored on the end anyway.
  }

  const match = FILENAME_DATE_PATTERN.exec(pathname);
  if (match === null) return null;

  return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** `27 Jul 2026`, `27 July 2026`, `27-Jul-2026`. */
const MONTH_NAME_PATTERN = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{4})$/;

/** `27/07/2026`, `27-07-2026`, `27.07.2026` — day first, per Australian convention. */
const NUMERIC_PATTERN = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/;

/**
 * Parses an Australian-format date label into `YYYY-MM-DD`.
 *
 * Day-first throughout: `05/01/2026` is 5 January 2026, not 1 May. Getting
 * this backwards would silently pick the wrong archive for eleven days of
 * every month, so the numeric form is never interpreted month-first.
 */
export function parseAustralianDateLabel(label: string): string | null {
  const text = label.replace(/\s+/g, ' ').trim();
  if (text === '') return null;

  const named = MONTH_NAME_PATTERN.exec(text);
  if (named !== null) {
    const month = MONTHS[named[2].toLowerCase()];
    if (month === undefined) return null;
    return toIsoDate(Number(named[3]), month, Number(named[1]));
  }

  const numeric = NUMERIC_PATTERN.exec(text);
  if (numeric !== null) {
    return toIsoDate(
      Number(numeric[3]),
      Number(numeric[2]),
      Number(numeric[1]),
    );
  }

  return null;
}

/**
 * Resolves the release date for a candidate, preferring the canonical
 * filename date and falling back to the visible label. Returns the date
 * plus whichever source produced it and whether the two disagreed, so the
 * caller can log a warning when the page's label and its own filename
 * contradict each other.
 */
export function resolveReleaseDate(
  url: string,
  label: string,
): {
  readonly date: string;
  readonly source: 'filename' | 'label';
  readonly mismatch: boolean;
} | null {
  const fromFilename = parseFilenameReleaseDate(url);
  const fromLabel = parseAustralianDateLabel(label);

  if (fromFilename !== null) {
    return {
      date: fromFilename,
      source: 'filename',
      mismatch: fromLabel !== null && fromLabel !== fromFilename,
    };
  }

  if (fromLabel !== null) {
    return { date: fromLabel, source: 'label', mismatch: false };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Link extraction — pure regex anchor scan (no jsdom/cheerio dependency),
// fully unit-testable against saved HTML fixtures independent of Puppeteer.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Matches a whole anchor element, capturing the href and the inner markup.
 * `[\s\S]` rather than the `s` flag so the inner text may span lines, and
 * non-greedy so adjacent anchors don't collapse into one match.
 */
const ANCHOR_PATTERN =
  /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

/** The handful of entities that actually show up in listing labels. */
const ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
});

/** Reduces an anchor's inner markup to its visible text. */
function toVisibleText(innerHtml: string): string {
  return innerHtml
    .replace(/<[^>]*>/g, '') // Nested <span>, <strong> etc. around the date.
    .replace(
      /&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/gi,
      (entity) => ENTITIES[entity.toLowerCase()] ?? entity,
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** A weekly archive link with its visible label and resolved release date. */
export interface ArchiveCandidate {
  /** Absolute URL, resolved against the containing document's base. */
  readonly url: string;
  /** The anchor's visible text, tags and entities stripped. */
  readonly label: string;
  /** Release date as `YYYY-MM-DD`. */
  readonly releaseDate: string;
  /** Which of the two sources the date came from. */
  readonly dateSource: 'filename' | 'label';
  /** True when filename and label dates disagree — worth logging. */
  readonly dateMismatch: boolean;
}

/**
 * Scans `html` for anchors, resolves each href against `baseUrl` (so
 * relative links work), and returns those whose path matches `linkPattern`
 * *and* carry a parseable release date.
 *
 * Requiring a date is the safety net behind the URL pattern: even if the
 * pattern is loosened, a yearly archive like `/__psi/yearly/1990.zip` has no
 * `YYYYMMDD` filename and no date label, so it can never win selection.
 */
export function extractCandidateArchiveLinks(
  html: string,
  linkPattern: RegExp,
  baseUrl: string,
): ArchiveCandidate[] {
  const candidates: ArchiveCandidate[] = [];
  const pattern = new RegExp(
    linkPattern.source,
    linkPattern.flags.includes('i')
      ? linkPattern.flags
      : `${linkPattern.flags}i`,
  );

  for (const match of html.matchAll(ANCHOR_PATTERN)) {
    const href = match[1];
    if (href === undefined || href === '') continue;

    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      continue; // e.g. "javascript:launch(...)" — not a resolvable URL.
    }

    // `lastIndex` is irrelevant here: `pattern` carries no /g flag, so `test`
    // does not advance any internal cursor between candidates.
    if (!pattern.test(resolved.pathname) && !pattern.test(resolved.href))
      continue;

    const label = toVisibleText(match[2] ?? '');
    const release = resolveReleaseDate(resolved.href, label);
    if (release === null) continue;

    candidates.push({
      url: resolved.href,
      label,
      releaseDate: release.date,
      dateSource: release.source,
      dateMismatch: release.mismatch,
    });
  }

  return candidates;
}

/**
 * Orders candidates by release date, most recent first — never by DOM
 * position, and never by lexicographic URL order, so a listing that
 * reorders its rows or changes its filename width still selects correctly.
 * Ties break on URL for determinism. Does not mutate its input.
 */
export function sortCandidatesNewestFirst(
  candidates: readonly ArchiveCandidate[],
): ArchiveCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.releaseDate !== b.releaseDate)
      return a.releaseDate < b.releaseDate ? 1 : -1;
    return a.url < b.url ? 1 : a.url > b.url ? -1 : 0;
  });
}

/** Merges per-frame candidate lists, keeping the first occurrence of each URL. */
export function dedupeCandidates(
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

// ─────────────────────────────────────────────────────────────────────────
// URL guard — the SSRF check. A link scraped from a web page is untrusted
// input; without this, a compromised or malicious discovery page could
// point the downloader at an internal service instead of the real NSW host.
// ─────────────────────────────────────────────────────────────────────────

export function assertAllowedDownloadUrl(
  url: string,
  allowedHosts: readonly string[],
): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PropertySalesIngestionException(
      'DOWNLOAD_SCHEME_NOT_ALLOWED',
      `"${url}" is not a valid URL`,
      {
        context: { url },
      },
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new PropertySalesIngestionException(
      'DOWNLOAD_SCHEME_NOT_ALLOWED',
      `Refusing to fetch "${url}": scheme must be https, got "${parsed.protocol}"`,
      { context: { url, protocol: parsed.protocol } },
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (!allowedHosts.includes(host)) {
    throw new PropertySalesIngestionException(
      'DOWNLOAD_HOST_NOT_ALLOWED',
      `Refusing to fetch "${url}": host "${host}" is not on the configured allowlist`,
      { context: { url, host, allowedHosts } },
    );
  }

  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────
// SourceDiscoveryService — drives a real browser page to find weekly
// archive links. `looksChallenged`/`collectCandidates`/the settle-loop carry
// over from the reference implementation unchanged; the whole point of the
// DiscoveryPage/DiscoveryFrame structural typing above is that this class is
// unit-testable with hand-written fakes over saved HTML fixtures.
// ─────────────────────────────────────────────────────────────────────────

/** Hosts that serve bot-check interstitials rather than the requested page. */
const CHALLENGE_HOST = 'challenges.cloudflare.com';

/** Interstitial titles, lowercased. Cloudflare's is "Just a moment...". */
const CHALLENGE_TITLES = [
  'just a moment',
  'attention required',
  'checking your browser',
];

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

  /**
   * True when the document we're looking at is a bot-check interstitial
   * rather than the listing. Distinguishing this from "the page loaded but
   * had no links" is the difference between an actionable error and a
   * misleading one.
   */
  private async looksChallenged(
    page: DiscoveryPage,
    status: number | null,
  ): Promise<boolean> {
    if (status === 403 || status === 503) return true;
    if (page.frames().some((frame) => frame.url().includes(CHALLENGE_HOST)))
      return true;

    const title = (await page.title()).trim().toLowerCase();
    return CHALLENGE_TITLES.some((candidate) => title.startsWith(candidate));
  }

  /**
   * Collects candidates from the main document and every child frame, so a
   * listing served inside an iframe is still found. Frames that cannot be
   * read (cross-origin, or torn down mid-read) are skipped rather than
   * fatal — the interesting content may well be in a sibling frame.
   */
  private async collectCandidates(
    page: DiscoveryPage,
    linkPattern: RegExp,
  ): Promise<ArchiveCandidate[]> {
    const found: ArchiveCandidate[] = [];

    for (const frame of page.frames()) {
      const frameUrl = frame.url();
      if (frameUrl.startsWith('about:') || frameUrl.includes(CHALLENGE_HOST))
        continue;

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
    // PsiBrowserService below and DiscoveryPage's own doc comment.
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

      throw new PropertySalesIngestionException(
        'DISCOVERY_NO_CANDIDATES',
        `No weekly archive links found on ${this.config.discoveryUrl} matching pattern ${linkPattern.source}. ` +
          'The page loaded normally, so its structure has probably changed — verify PSI_DISCOVERY_URL and PSI_WEEKLY_LINK_PATTERN against the live page.',
        {
          context: {
            url: this.config.discoveryUrl,
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
      throw new PropertySalesIngestionException(
        'DISCOVERY_NO_CANDIDATES',
        `Every candidate found on ${this.config.discoveryUrl} was on a host outside the configured allowlist`,
        {
          context: {
            url: this.config.discoveryUrl,
            candidateCount: sorted.length,
          },
        },
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

// ─────────────────────────────────────────────────────────────────────────
// PsiBrowserService — the stealth-launched browser session shared by
// discovery and download. Deliberately NOT a reuse of
// supporting-evidence/shared/puppeteer.service.ts: that service's launch()
// passes --single-process, which crashes the renderer on a multi-hundred-KB
// ZIP moving through Chrome's download stack via CDP the same way it does on
// large PDF payloads. Stealth is unconditional here (not an opt-in flag,
// unlike the POC) since this repo's existing Puppeteer usage already runs
// headless + stealth in production with no toggle.
// ─────────────────────────────────────────────────────────────────────────

puppeteerExtra.use(StealthPlugin());

@Injectable()
export class PsiBrowserService {
  private readonly logger = new Logger(PsiBrowserService.name);

  constructor(private readonly config: PropertySalesConfig) {}

  async launch(): Promise<PuppeteerBrowser> {
    this.logger.log(
      JSON.stringify({
        context: 'PsiBrowser.launch',
        headless: this.config.headless,
        ts: new Date().toISOString(),
      }),
    );

    return (
      puppeteerExtra as unknown as {
        launch: (opts: unknown) => Promise<PuppeteerBrowser>;
      }
    ).launch({
      headless: this.config.headless,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
      ],
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ZIP validation — proves a downloaded file is a real archive before it is
// trusted as source data. A bot-protection challenge can be served *as an
// attachment*, in which case the browser reports a perfectly successful
// download of an HTML document; without this gate that body would be
// extracted and parsed as though it were genuine NSW data.
// ─────────────────────────────────────────────────────────────────────────

export interface ValidatedDownload {
  readonly bytes: number;
  readonly sha256: string;
  readonly entryCount: number;
}

/** Local file header. An empty archive (`PK\x05\x06`) has no DAT files, so it is not accepted. */
const ZIP_LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * Recognises a body that is really an HTML document. Deliberately generous:
 * challenge interstitials vary in whether they lead with a doctype, a
 * comment, or the `<html>` tag itself, and a BOM may precede any of them.
 */
function looksLikeHtml(head: Buffer): boolean {
  const withoutBom = head.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)
    ? head.subarray(UTF8_BOM.length)
    : head;
  const text = withoutBom.toString('latin1').trimStart().toLowerCase();
  return (
    text.startsWith('<!doctype') ||
    text.startsWith('<html') ||
    text.startsWith('<!--')
  );
}

/** Reads the leading bytes of a file, plus its size, in one open handle. */
async function readHead(
  path: string,
  length: number,
): Promise<{ head: Buffer; size: number }> {
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    const buffer = Buffer.alloc(Math.min(length, Math.max(size, 0)));
    if (buffer.length > 0) {
      await handle.read(buffer, 0, buffer.length, 0);
    }
    return { head: buffer, size };
  } finally {
    await handle.close();
  }
}

/**
 * Validates the file at `path` as a downloaded archive. Resolves with its
 * size, digest and entry count; throws a typed `PropertySalesIngestionException`
 * otherwise. Never moves or deletes the file — the caller owns its lifecycle.
 *
 * Four gates, in increasing cost order: non-empty, local-file-header
 * signature, central directory readable (catches a truncated transfer that
 * still carries a valid signature), sha256. Gate 2 distinguishes an HTML
 * body (DOWNLOAD_BLOCKED — a challenge served as an attachment) from any
 * other bad signature (DOWNLOAD_FAILED), so a challenge is never hidden
 * behind a generic error.
 */
export async function assertDownloadedZip(
  path: string,
  url: string,
): Promise<ValidatedDownload> {
  // 64 bytes is far more than the signature needs, and enough for the leading
  // whitespace/BOM/comment that an HTML body may carry before its first tag.
  const { head, size } = await readHead(path, 64);

  if (size === 0) {
    throw new PropertySalesIngestionException(
      'DOWNLOAD_FAILED',
      `Download of ${url} produced an empty file`,
      {
        context: { url, bytes: 0 },
      },
    );
  }

  if (
    !head
      .subarray(0, ZIP_LOCAL_FILE_HEADER.length)
      .equals(ZIP_LOCAL_FILE_HEADER)
  ) {
    const signature = head
      .subarray(0, ZIP_LOCAL_FILE_HEADER.length)
      .toString('hex');

    if (looksLikeHtml(head)) {
      throw new PropertySalesIngestionException(
        'DOWNLOAD_BLOCKED',
        `${url} returned an HTML document in place of the archive (${size} bytes, signature ${signature}). ` +
          'This is a bot-protection challenge served as an attachment rather than the file itself. ' +
          'The download was discarded — confirm PSI_HEADLESS/stealth configuration.',
        { context: { url, bytes: size, signature } },
      );
    }

    throw new PropertySalesIngestionException(
      'DOWNLOAD_FAILED',
      `${url} did not return a ZIP archive: expected signature 504b0304, got ${signature} (${size} bytes)`,
      { context: { url, bytes: size, signature } },
    );
  }

  // A valid signature is not proof of a complete transfer; walking the central
  // directory is. Surfaces as ARCHIVE_UNREADABLE, which is accurate here.
  const entryCount = await assertArchiveReadable(path);
  const sha256 = await sha256File(path);

  return { bytes: size, sha256, entryCount };
}

// ─────────────────────────────────────────────────────────────────────────
// downloadViaBrowser — fetches an archive using an already-open browser
// session. A direct Node `fetch` of a weekly ZIP returns `403 text/html`,
// verified directly; the same file fetched by the genuine browser session
// that was already served the listing succeeds. The transfer is handled by
// Chrome's own download stack via CDP, so the archive streams to disk and is
// never buffered in memory.
//
// Safety properties, every one preserved from the reference implementation:
// `behavior: 'allowAndName'` names the file by GUID (never the server's
// Content-Disposition filename — no path traversal from an attacker-chosen
// name); the GUID is validated before being joined to a path anyway; size is
// capped both from the declared total and bytes actually received, and the
// finished file is re-checked with `stat`; the transfer lands on a `.part`
// file and is only renamed to the caller's destination after it validates
// as a real archive via assertDownloadedZip above.
// ─────────────────────────────────────────────────────────────────────────

export interface BrowserDownloadOptions {
  readonly timeoutMs: number;
  readonly maxBytes: number;
}

/**
 * How long to wait after the navigation renders a normal page before
 * concluding that no download was triggered. Short: the download event
 * normally precedes navigation completion.
 */
const NO_DOWNLOAD_GRACE_MS = 3_000;

/** Chrome aborts the navigation when the response turns out to be a download. */
function isDownloadAbort(err: unknown): boolean {
  return err instanceof Error && err.message.includes('net::ERR_ABORTED');
}

/** GUIDs come from Chrome, but they are joined to a path — so verify them. */
function assertSafeGuid(guid: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(guid) || guid === '.' || guid === '..') {
    throw new PropertySalesIngestionException(
      'DOWNLOAD_FAILED',
      `Refusing to use an unsafe download identifier: ${guid}`,
      { context: { guid } },
    );
  }
}

export async function downloadViaBrowser(
  browser: PuppeteerBrowser,
  url: string,
  destinationPath: string,
  options: BrowserDownloadOptions,
): Promise<ValidatedDownload> {
  const downloadDir = resolve(dirname(destinationPath));
  const partialPath = `${destinationPath}.part`;
  const client = await browser.target().createCDPSession();
  const page = await browser.newPage();

  let guid: string | undefined;
  let sawDownload = false;
  let settle: (() => void) | undefined;

  // Cloudflare marks an intercepted request with `cf-mitigated: challenge`.
  // Recording it lets the failure name the real cause instead of guessing.
  let challengedResponse = false;
  const onResponse = (response: {
    url(): string;
    headers(): Record<string, string>;
  }): void => {
    if (response.url() !== url) return;
    if ((response.headers()['cf-mitigated'] ?? '').includes('challenge'))
      challengedResponse = true;
  };
  page.on('response', onResponse);

  /** Resolves with the byte count once Chrome reports the download complete. */
  const completed = new Promise<number>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(
        new PropertySalesIngestionException(
          'DOWNLOAD_FAILED',
          `Download of ${url} did not complete within ${options.timeoutMs}ms`,
          { context: { url, timeoutMs: options.timeoutMs } },
        ),
      );
    }, options.timeoutMs);

    settle = () => {
      clearTimeout(timer);
    };

    client.on('Browser.downloadWillBegin', (event) => {
      sawDownload = true;
      guid = event.guid;
    });

    client.on('Browser.downloadProgress', (event) => {
      sawDownload = true;
      guid = event.guid;

      const overLimit =
        event.totalBytes > options.maxBytes ||
        event.receivedBytes > options.maxBytes;
      if (overLimit) {
        void client
          .send('Browser.cancelDownload', { guid: event.guid })
          .catch(() => {
            // Already finished or gone; the size check below is what matters.
          });
        rejectPromise(
          new PropertySalesIngestionException(
            'DOWNLOAD_TOO_LARGE',
            `Archive exceeds the ${options.maxBytes} byte limit (declared ${event.totalBytes}, received ${event.receivedBytes})`,
            {
              context: {
                url,
                totalBytes: event.totalBytes,
                receivedBytes: event.receivedBytes,
              },
            },
          ),
        );
        return;
      }

      if (event.state === 'completed') {
        resolvePromise(event.receivedBytes);
      } else if (event.state === 'canceled') {
        rejectPromise(
          new PropertySalesIngestionException(
            'DOWNLOAD_FAILED',
            `Download of ${url} was canceled by the browser`,
            { context: { url } },
          ),
        );
      }
    });
  });

  try {
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allowAndName',
      downloadPath: downloadDir,
      eventsEnabled: true,
    });

    // Navigating to the archive turns into a download, which aborts the
    // navigation — that specific abort is the success signal, not a failure.
    let renderedStatus: number | null = null;
    try {
      const response = await page.goto(url, { timeout: options.timeoutMs });
      renderedStatus = response?.status() ?? null;
    } catch (err) {
      if (!isDownloadAbort(err)) throw err;
    }

    // The navigation rendered a document instead of downloading. Give the
    // download event a moment in case of ordering, then fail — a page served
    // in place of the file means the request was intercepted, not fulfilled.
    if (renderedStatus !== null) {
      await new Promise((r) => setTimeout(r, NO_DOWNLOAD_GRACE_MS));
      if (!sawDownload) {
        throw challengedResponse
          ? new PropertySalesIngestionException(
              'DOWNLOAD_BLOCKED',
              `${url} is behind a bot-protection challenge (status ${renderedStatus}, cf-mitigated: challenge). ` +
                'The archive endpoint is challenged separately from the listing page. This pipeline already runs ' +
                'headless with stealth unconditionally (see PsiBrowserService above) — if this persists, the ' +
                'challenge has likely escalated beyond what a scoped, evidence-based exception covers.',
              { context: { url, status: renderedStatus } },
            )
          : new PropertySalesIngestionException(
              'DOWNLOAD_FAILED',
              `${url} returned a page (status ${renderedStatus}) instead of a file`,
              { context: { url, status: renderedStatus } },
            );
      }
    }

    // Awaited for the completion signal, not for its byte count: the validator
    // stats the file anyway, and Chrome occasionally reports 0 received bytes
    // on an otherwise complete download. The filesystem is the honest source.
    await completed;

    if (guid === undefined) {
      throw new PropertySalesIngestionException(
        'DOWNLOAD_FAILED',
        `Download of ${url} reported no file identifier`,
        { context: { url } },
      );
    }
    assertSafeGuid(guid);

    const downloadedPath = join(downloadDir, guid);
    const finalSize = (await stat(downloadedPath)).size;
    if (finalSize > options.maxBytes) {
      await unlink(downloadedPath).catch(() => undefined);
      throw new PropertySalesIngestionException(
        'DOWNLOAD_TOO_LARGE',
        `Downloaded archive is ${finalSize} bytes, over the ${options.maxBytes} byte limit`,
        { context: { url, finalSize } },
      );
    }

    // Stage under `.part` first: until the bytes are proven to be an archive,
    // nothing may exist at the path the caller treats as downloaded.
    await rename(downloadedPath, partialPath);
    const validated = await assertDownloadedZip(partialPath, url);
    await rename(partialPath, destinationPath);

    return validated;
  } catch (err) {
    if (guid !== undefined && /^[A-Za-z0-9._-]+$/.test(guid)) {
      // Best-effort removal of a partial file inside the run's own staging dir.
      await unlink(join(downloadDir, guid)).catch(() => undefined);
    }
    // The `.part` is inside the same caller-supplied directory. Removing it is
    // what keeps a rejected download — a challenge page, a truncated transfer —
    // from being left behind as though it were source data.
    await unlink(partialPath).catch(() => undefined);
    if (err instanceof PropertySalesIngestionException) throw err;
    throw new PropertySalesIngestionException(
      'DOWNLOAD_FAILED',
      `Browser download failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err, context: { url } },
    );
  } finally {
    settle?.();
    page.off('response', onResponse);
    client.removeAllListeners();
    await client.detach().catch(() => undefined);
    await page.close().catch(() => undefined);
  }
}
