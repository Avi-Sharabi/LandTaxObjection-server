// Canonical form is a Sydney CALENDAR date, 'YYYY-MM-DD' — never a wall-clock Date — because the
// columns this drives (e.g. DisputeCase.statutory_deadline) are Postgres `date`, not an instant.
// A Date is constructed only at the query boundary, via toDbDate below.
export const AU_TIME_ZONE = 'Australia/Sydney';

const AU_DATE_PARTS = new Intl.DateTimeFormat('en-AU', {
  timeZone: AU_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Today's calendar date in Sydney, as 'YYYY-MM-DD'.
 *
 * Built from Intl.DateTimeFormat#formatToParts rather than trusting a locale whose field order
 * happens to be ISO (e.g. en-CA) — that would be a hidden dependency on ICU data. `now` is
 * injectable so the Sydney/UTC boundary is testable without mocking the clock.
 */
export function auToday(now: Date = new Date()): string {
  const parts = AU_DATE_PARTS.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Calendar arithmetic on a 'YYYY-MM-DD' string. Anchored at UTC noon so the day-of-month
 * arithmetic can never be pushed onto an adjacent date by a DST transition — UTC has none.
 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d, 12));
  result.setUTCDate(result.getUTCDate() + days);
  return toDateString(result);
}

/** Whole days from `from` to `to`; negative when `to` is in the past. Exact — no rounding. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd, 12);
  const toUtc = Date.UTC(ty, tm - 1, td, 12);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

/**
 * Normalise a `date` column value to 'YYYY-MM-DD'. TypeORM hydrates a Postgres `date` column as
 * a string at runtime despite typing it `Date` on the entity — but seeders and in-memory test
 * fixtures often construct a real `Date` directly, so both are accepted here.
 */
export function toDateString(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/**
 * The Date to bind for a `date`-column FindOperator (MoreThan/Between/LessThan).
 *
 * FindOptionsWhere<DisputeCase> resolves statutory_deadline to `Date | FindOperator<Date>`, so
 * this must return a Date — MoreThan('2026-09-02') would infer FindOperator<string>, which is
 * not assignable. TypeORM's WHERE-parameter path never applies DateUtils.mixedDateToDateString
 * (that only runs on INSERT/UPDATE and result hydration); the raw Date reaches `pg`, which
 * serialises it with the Node process's LOCAL getters (getFullYear/getMonth/getDate), and
 * Postgres' date_in() then reads only the leading YYYY-MM-DD, ignoring the session timezone.
 * So the governing zone is the app server's own clock, not UTC and not Postgres' session
 * timezone — building the Date from local components (not a UTC anchor) is what makes the
 * bound value exactly `date` regardless of what timezone the server happens to run in.
 */
export function toDbDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
