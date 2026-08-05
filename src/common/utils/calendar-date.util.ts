/**
 * True if year/month/day form a real calendar date (rejects e.g. Feb 30,
 * month 13) — JS's Date silently rolls invalid components over into the
 * next month/day rather than throwing, so this round-trip check is the
 * validation step; Intl doesn't replace it (Intl only formats an
 * already-constructed Date, it doesn't validate the inputs that built it).
 */
export function isValidCalendarDate(
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

const ISO_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', // must be explicit — Intl otherwise formats in the host's
  // local timezone, which would make output depend on the server's TZ
  // setting instead of being deterministic.
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Formats a valid calendar date as YYYY-MM-DD via Intl.DateTimeFormat's
 * zero-padded parts, instead of manual padStart/template-string assembly.
 * Caller must validate with isValidCalendarDate first — this does not
 * re-validate. Part order is assembled explicitly (not read off the
 * formatter's locale-dependent output order), so this doesn't rely on any
 * locale's specific date-ordering convention.
 */
export function formatIsoDate(
  year: number,
  month: number,
  day: number,
): string {
  const parts = ISO_DATE_FORMATTER.formatToParts(
    new Date(Date.UTC(year, month - 1, day)),
  );
  const part = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
