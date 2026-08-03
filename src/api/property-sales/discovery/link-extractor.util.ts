/**
 * Extracts candidate weekly-archive links from a discovery page's HTML.
 * Pure — no browser, no network — so it is fully unit-testable against
 * saved HTML fixtures, independent of Puppeteer or the live NSW site.
 *
 * A regex anchor scan rather than a DOM parser dependency: the only things
 * needed are anchor hrefs matching a configured pattern and the visible text
 * beside them, which doesn't justify adding jsdom/cheerio to the dependency
 * list.
 *
 * Ported from nsw-property-sales-poc/src/discovery/link-extractor.ts
 * (KAN-241). Adaptation: `sortCandidatesNewestFirst` is new — it extracts the
 * comparator that `selectLatestArchiveLink` already used internally, because
 * KAN-241's sweep needs the full ordered list (catch-up), not just the one
 * newest candidate the POC's `run --latest` needed.
 */

import { resolveReleaseDate } from './release-date.util';

/**
 * Matches a whole anchor element, capturing the href and the inner markup.
 * `[\s\S]` rather than the `s` flag so the inner text may span lines, and
 * non-greedy so adjacent anchors don't collapse into one match.
 */
const ANCHOR_PATTERN = /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

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
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
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
 * Scans `html` for anchors, resolves each href against `baseUrl` (so relative
 * links work), and returns those whose path matches `linkPattern` *and* carry
 * a parseable release date.
 *
 * Requiring a date is the safety net behind the URL pattern: even if the
 * pattern is loosened, a yearly archive like `/__psi/yearly/1990.zip` has no
 * `YYYYMMDD` filename and no date label, so it can never win selection.
 *
 * Malformed hrefs (e.g. `javascript:...`, unparseable URLs) are skipped rather
 * than thrown on — this is a page the project does not control, and one broken
 * link should not fail the whole page.
 */
export function extractCandidateArchiveLinks(
  html: string,
  linkPattern: RegExp,
  baseUrl: string,
): ArchiveCandidate[] {
  const candidates: ArchiveCandidate[] = [];
  const pattern = new RegExp(
    linkPattern.source,
    linkPattern.flags.includes('i') ? linkPattern.flags : `${linkPattern.flags}i`,
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
    if (!pattern.test(resolved.pathname) && !pattern.test(resolved.href)) continue;

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
 * position, and never by lexicographic URL order, so a listing that reorders
 * its rows or changes its filename width still selects correctly.
 *
 * Ties (the same date published twice) break on URL for determinism. Does
 * not mutate its input.
 */
export function sortCandidatesNewestFirst(
  candidates: readonly ArchiveCandidate[],
): ArchiveCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.releaseDate !== b.releaseDate) return a.releaseDate < b.releaseDate ? 1 : -1;
    return a.url < b.url ? 1 : a.url > b.url ? -1 : 0;
  });
}

/**
 * Picks the single most recent archive. Kept for parity with the POC and any
 * caller that only wants the latest; KAN-241's sweep itself uses
 * `sortCandidatesNewestFirst` directly since it needs the whole ordered list
 * for catch-up, not just the head of it.
 */
export function selectLatestArchiveLink(
  candidates: readonly ArchiveCandidate[],
): ArchiveCandidate | null {
  if (candidates.length === 0) return null;
  return sortCandidatesNewestFirst(candidates)[0]!;
}

/** Merges per-frame candidate lists, keeping the first occurrence of each URL. */
export function dedupeCandidates(candidates: readonly ArchiveCandidate[]): ArchiveCandidate[] {
  const seen = new Set<string>();
  const unique: ArchiveCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    unique.push(candidate);
  }
  return unique;
}
