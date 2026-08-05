import {
  formatIsoDate,
  isValidCalendarDate,
} from '../../common/utils/calendar-date.util';
import type { ArchiveCandidate } from './archive-selection.util';

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!isValidCalendarDate(year, month, day)) return null;
  return formatIsoDate(year, month, day);
}

const FILENAME_DATE_PATTERN = /(\d{4})(\d{2})(\d{2})\.zip$/i;

function parseFilenameReleaseDate(pathname: string): string | null {
  const match = FILENAME_DATE_PATTERN.exec(pathname);
  if (match === null) return null;

  return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function toCandidates(
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

export function sortCandidatesNewestFirst(
  candidates: readonly ArchiveCandidate[],
): ArchiveCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.releaseDate !== b.releaseDate)
      return a.releaseDate < b.releaseDate ? 1 : -1;
    return a.url < b.url ? 1 : a.url > b.url ? -1 : 0;
  });
}

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
