import {
  parseAustralianDateLabel,
  parseFilenameReleaseDate,
  resolveReleaseDate,
} from './release-date.util';

describe('parseFilenameReleaseDate', () => {
  it('reads the YYYYMMDD stem out of a weekly archive URL', () => {
    expect(parseFilenameReleaseDate('https://example.gov.au/__psi/weekly/20260727.zip')).toBe(
      '2026-07-27',
    );
  });

  it('accepts a bare path as well as an absolute URL', () => {
    expect(parseFilenameReleaseDate('/__psi/weekly/20260105.zip')).toBe('2026-01-05');
  });

  it('ignores a query string and mixed-case extension', () => {
    expect(parseFilenameReleaseDate('https://example.gov.au/__psi/weekly/20260713.ZIP?v=2')).toBe(
      '2026-07-13',
    );
  });

  it('returns null for a yearly archive, which is what keeps it out of weekly selection', () => {
    expect(parseFilenameReleaseDate('https://example.gov.au/__psi/yearly/1990.zip')).toBeNull();
  });

  it('rejects an impossible calendar date in the filename', () => {
    expect(parseFilenameReleaseDate('/__psi/weekly/20260230.zip')).toBeNull();
    expect(parseFilenameReleaseDate('/__psi/weekly/20261301.zip')).toBeNull();
  });

  it('returns null rather than throwing on junk', () => {
    expect(parseFilenameReleaseDate('not a url at all')).toBeNull();
    expect(parseFilenameReleaseDate('')).toBeNull();
  });
});

describe('parseAustralianDateLabel', () => {
  it('parses the abbreviated month form the listing uses', () => {
    expect(parseAustralianDateLabel('27 Jul 2026')).toBe('2026-07-27');
    expect(parseAustralianDateLabel('05 Jan 2026')).toBe('2026-01-05');
  });

  it('parses the full month name and a single-digit day', () => {
    expect(parseAustralianDateLabel('27 July 2026')).toBe('2026-07-27');
    expect(parseAustralianDateLabel('5 September 2026')).toBe('2026-09-05');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(parseAustralianDateLabel('  27   JUL   2026 ')).toBe('2026-07-27');
    expect(parseAustralianDateLabel('27-jul-2026')).toBe('2026-07-27');
  });

  it('reads numeric dates day-first, per Australian convention', () => {
    // The whole point: 05/01/2026 is 5 January, never 1 May.
    expect(parseAustralianDateLabel('05/01/2026')).toBe('2026-01-05');
    expect(parseAustralianDateLabel('27/07/2026')).toBe('2026-07-27');
    expect(parseAustralianDateLabel('27-07-2026')).toBe('2026-07-27');
    expect(parseAustralianDateLabel('27.07.2026')).toBe('2026-07-27');
  });

  it('rejects impossible dates', () => {
    expect(parseAustralianDateLabel('32 Jan 2026')).toBeNull();
    expect(parseAustralianDateLabel('30 Feb 2026')).toBeNull();
    expect(parseAustralianDateLabel('29 Feb 2025')).toBeNull();
    expect(parseAustralianDateLabel('13/25/2026')).toBeNull();
  });

  it('accepts a real leap day', () => {
    expect(parseAustralianDateLabel('29 Feb 2028')).toBe('2028-02-29');
  });

  it('returns null for labels that are not dates', () => {
    expect(parseAustralianDateLabel('1990')).toBeNull();
    expect(parseAustralianDateLabel('Weekly sales data')).toBeNull();
    expect(parseAustralianDateLabel('27 Smarch 2026')).toBeNull();
    expect(parseAustralianDateLabel('')).toBeNull();
  });
});

describe('resolveReleaseDate', () => {
  it('prefers the filename and reports agreement with the label', () => {
    expect(resolveReleaseDate('/__psi/weekly/20260727.zip', '27 Jul 2026')).toEqual({
      date: '2026-07-27',
      source: 'filename',
      mismatch: false,
    });
  });

  it('flags a filename/label disagreement while still trusting the filename', () => {
    expect(resolveReleaseDate('/__psi/weekly/20260727.zip', '20 Jul 2026')).toEqual({
      date: '2026-07-27',
      source: 'filename',
      mismatch: true,
    });
  });

  it('falls back to the label when the filename carries no date', () => {
    expect(resolveReleaseDate('/__psi/weekly/latest.zip', '27 Jul 2026')).toEqual({
      date: '2026-07-27',
      source: 'label',
      mismatch: false,
    });
  });

  it('returns null when neither source yields a date', () => {
    expect(resolveReleaseDate('/__psi/yearly/1990.zip', '1990')).toBeNull();
  });
});
