/**
 * Parses weekly-archive release dates, from either the archive URL or the
 * anchor text beside it. Pure — no browser, no network, no I/O.
 *
 * Two independent sources, because the live listing carries both and they
 * guard each other: the filename (`/__psi/weekly/20260727.zip`) is canonical
 * and machine-generated, while the visible label (`27 Jul 2026`) is what a
 * human reads off the page. The filename wins when both parse; the label is
 * the fallback if the naming convention ever changes, and a cross-check
 * otherwise.
 *
 * Everything returns `null` rather than throwing: these run against a page
 * this project does not control, and one malformed row must not fail a whole
 * discovery pass.
 *
 * Ported verbatim from nsw-property-sales-poc/src/discovery/release-date.ts
 * (KAN-241) — no logic changes; this file has no imports so there is nothing
 * ESM-specific to adapt.
 */

/**
 * Months as they appear on the NSW listing, indexed from 1. Accepts both the
 * abbreviated (`Jul`) and full (`July`) forms; `sept` is included because it
 * appears in the wild alongside `sep`.
 */
const MONTHS: Readonly<Record<string, number>> = Object.freeze({
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
});

/**
 * Rejects impossible calendar dates (31 Feb, 30 Feb in a non-leap year) by
 * round-tripping through `Date.UTC` and checking the components survive.
 */
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
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
    const month = MONTHS[named[2]!.toLowerCase()];
    if (month === undefined) return null;
    return toIsoDate(Number(named[3]), month, Number(named[1]));
  }

  const numeric = NUMERIC_PATTERN.exec(text);
  if (numeric !== null) {
    return toIsoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  }

  return null;
}

/**
 * Resolves the release date for a candidate, preferring the canonical
 * filename date and falling back to the visible label.
 *
 * Returns the date plus whichever source produced it and whether the two
 * disagreed, so the caller can log a warning when the page's label and its
 * own filename contradict each other — a signal the listing's conventions
 * have shifted and the pattern needs revisiting.
 */
export function resolveReleaseDate(
  url: string,
  label: string,
): { readonly date: string; readonly source: 'filename' | 'label'; readonly mismatch: boolean } | null {
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
