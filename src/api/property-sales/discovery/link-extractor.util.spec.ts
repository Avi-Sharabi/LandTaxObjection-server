import {
  dedupeCandidates,
  extractCandidateArchiveLinks,
  selectLatestArchiveLink,
  sortCandidatesNewestFirst,
  type ArchiveCandidate,
} from './link-extractor.util';
import { BULK_PSI_WEEKLY_HTML, PORTAL_ENTRY_NO_LINKS_HTML } from '../__testing__/discovery-html.fixture';

const WEEKLY_PATTERN = /^\/__psi\/weekly\/\d{8}\.zip$/i;
const BASE = 'https://example.gov.au/psi/';

function candidate(url: string, releaseDate: string): ArchiveCandidate {
  return { url, label: releaseDate, releaseDate, dateSource: 'filename', dateMismatch: false };
}

describe('extractCandidateArchiveLinks', () => {
  it('finds weekly archives and resolves them to absolute URLs', () => {
    const found = extractCandidateArchiveLinks(BULK_PSI_WEEKLY_HTML, WEEKLY_PATTERN, BASE);

    expect(found.map((c) => c.url).sort()).toEqual([
      'https://example.gov.au/__psi/weekly/20260713.zip',
      'https://example.gov.au/__psi/weekly/20260720.zip',
      'https://example.gov.au/__psi/weekly/20260727.zip',
    ]);
  });

  it('resolves a relative href against the document base', () => {
    const found = extractCandidateArchiveLinks(BULK_PSI_WEEKLY_HTML, WEEKLY_PATTERN, BASE);

    // The fixture's 20 Jul row uses href="/__psi/weekly/20260720.zip".
    const relative = found.find((c) => c.releaseDate === '2026-07-20');
    expect(relative?.url).toBe('https://example.gov.au/__psi/weekly/20260720.zip');
  });

  it('excludes yearly archives and unrelated links', () => {
    const found = extractCandidateArchiveLinks(BULK_PSI_WEEKLY_HTML, WEEKLY_PATTERN, BASE);

    expect(found.some((c) => c.url.includes('/yearly/'))).toBe(false);
    expect(found.some((c) => c.url.includes('/about'))).toBe(false);
  });

  it('captures the visible label, stripping nested tags and entities', () => {
    const found = extractCandidateArchiveLinks(BULK_PSI_WEEKLY_HTML, WEEKLY_PATTERN, BASE);
    const byDate = new Map(found.map((c) => [c.releaseDate, c.label]));

    expect(byDate.get('2026-07-13')).toBe('13 Jul 2026');
    expect(byDate.get('2026-07-27')).toBe('27 Jul 2026'); // was wrapped in <span>
    expect(byDate.get('2026-07-20')).toBe('20 Jul 2026'); // was &nbsp;-separated
  });

  it('returns no candidates for a page with no archive links', () => {
    expect(
      extractCandidateArchiveLinks(PORTAL_ENTRY_NO_LINKS_HTML, WEEKLY_PATTERN, 'https://example.gov.au/'),
    ).toEqual([]);
  });

  it('drops a matching link that carries no parseable date', () => {
    // Safety net: even if the pattern is loosened, an undated archive cannot win.
    const html = `<a href="/__psi/weekly/latest.zip">Most recent</a>`;
    const found = extractCandidateArchiveLinks(html, /^\/__psi\/weekly\/.*\.zip$/i, BASE);
    expect(found).toEqual([]);
  });

  it('skips an unparseable href instead of throwing', () => {
    const html = `<a href="ht!tp://[bad">bad</a><a href="/__psi/weekly/20260727.zip">27 Jul 2026</a>`;
    const found = extractCandidateArchiveLinks(html, WEEKLY_PATTERN, 'https://example.gov.au/');
    expect(found.map((c) => c.url)).toEqual(['https://example.gov.au/__psi/weekly/20260727.zip']);
  });

  it('matches case-insensitively regardless of pattern flags supplied', () => {
    const html = `<a HREF="/__psi/WEEKLY/20260727.ZIP">27 Jul 2026</a>`;
    const found = extractCandidateArchiveLinks(
      html,
      /^\/__psi\/weekly\/\d{8}\.zip$/,
      'https://example.gov.au/',
    );
    expect(found.map((c) => c.url)).toEqual(['https://example.gov.au/__psi/WEEKLY/20260727.ZIP']);
  });

  it('finds every candidate rather than stopping at the first', () => {
    expect(extractCandidateArchiveLinks(BULK_PSI_WEEKLY_HTML, WEEKLY_PATTERN, BASE)).toHaveLength(3);
  });
});

describe('sortCandidatesNewestFirst', () => {
  it('orders by release date, most recent first', () => {
    const found = extractCandidateArchiveLinks(BULK_PSI_WEEKLY_HTML, WEEKLY_PATTERN, BASE);
    expect(sortCandidatesNewestFirst(found).map((c) => c.releaseDate)).toEqual([
      '2026-07-27',
      '2026-07-20',
      '2026-07-13',
    ]);
  });

  it('orders by date even when URLs do not sort chronologically', () => {
    // A width change (or any renaming) breaks lexicographic ordering: as
    // strings, "9260727" > "20260803". The parsed date is what must decide.
    const candidates = [
      candidate('https://example.gov.au/__psi/weekly/20260803.zip', '2026-08-03'),
      candidate('https://example.gov.au/__psi/weekly/9260727.zip', '2026-07-27'),
    ];
    expect(sortCandidatesNewestFirst(candidates).map((c) => c.releaseDate)).toEqual([
      '2026-08-03',
      '2026-07-27',
    ]);
  });

  it('breaks ties on URL deterministically', () => {
    const a = candidate('https://example.gov.au/a/20260727.zip', '2026-07-27');
    const b = candidate('https://example.gov.au/b/20260727.zip', '2026-07-27');
    expect(sortCandidatesNewestFirst([a, b])[0]?.url).toBe(b.url);
    expect(sortCandidatesNewestFirst([b, a])[0]?.url).toBe(b.url);
  });

  it('does not mutate the input array', () => {
    const candidates = [
      candidate('https://example.gov.au/__psi/weekly/20260713.zip', '2026-07-13'),
      candidate('https://example.gov.au/__psi/weekly/20260727.zip', '2026-07-27'),
    ];
    const snapshot = candidates.map((c) => c.url);
    sortCandidatesNewestFirst(candidates);
    expect(candidates.map((c) => c.url)).toEqual(snapshot);
  });
});

describe('selectLatestArchiveLink', () => {
  it('returns null for an empty list', () => {
    expect(selectLatestArchiveLink([])).toBeNull();
  });

  it('picks the latest by release date, not DOM position', () => {
    const found = extractCandidateArchiveLinks(BULK_PSI_WEEKLY_HTML, WEEKLY_PATTERN, BASE);

    // The fixture lists 13 Jul, then 27 Jul, then 20 Jul — so neither the
    // first nor the last DOM row is the right answer.
    expect(found.at(-1)?.releaseDate).toBe('2026-07-20');
    expect(selectLatestArchiveLink(found)?.releaseDate).toBe('2026-07-27');
  });
});

describe('dedupeCandidates', () => {
  it('keeps the first occurrence of each URL across frames', () => {
    const a = candidate('https://example.gov.au/__psi/weekly/20260727.zip', '2026-07-27');
    const b = candidate('https://example.gov.au/__psi/weekly/20260720.zip', '2026-07-20');
    expect(dedupeCandidates([a, b, { ...a, label: 'duplicate' }])).toEqual([a, b]);
  });

  it('returns an empty array unchanged', () => {
    expect(dedupeCandidates([])).toEqual([]);
  });
});
