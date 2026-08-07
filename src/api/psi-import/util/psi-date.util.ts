/**
 * Renders a `download_datetime` the way the VG site labels its weekly files, e.g. "03 Aug 2026".
 *
 * That string is the whole comparison mechanism: the reference label is matched against the
 * anchor text on the page, so no date parsing happens anywhere in the scrape path.
 *
 * The month table is deliberate, not a reinvention of `Intl`. The site uses day-first ordering
 * with three-letter months, and no `en-*` locale reproduces that for all twelve (verified on
 * ICU 77): `en-AU` renders June, July and Sept unabbreviated; `en-GB` still renders Sept;
 * `en-US`/`en-CA` abbreviate correctly but emit "Jul 03, 2026". Since this string has to match a
 * third party's markup exactly, it is spelled out here rather than left to CLDR data that can
 * shift with an ICU upgrade.
 *
 * Read in UTC because these values are calendar labels, not instants. `parseDatTimestamp` builds
 * them with `Date.UTC`, so reading them back in UTC round-trips to the date written in the source
 * file; a local-zone render would roll any stamp at or past 14:00 UTC onto the next day.
 */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatPsiLabel(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
