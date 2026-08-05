export interface ArchiveCandidate {
  readonly url: string;
  readonly releaseDate: string;
}

/**
 * Picks which discovered candidates to ingest this sync: excludes anything
 * already in `loadedReleaseDates`, then takes the oldest `maxArchives` of
 * what's left.
 *
 * KNOWN GAP: `loadedReleaseDates` is always empty today (see
 * PropertySalesRepository.readLoadedReleaseDates's doc comment) — nothing
 * anywhere writes a row this could ever match. So `missing` is always the
 * entire discovered candidate list, and this always selects the same oldest
 * `maxArchives` candidates every single run, with no forward progress across
 * syncs. Known, deliberately deferred.
 */
export function selectArchivesToIngest(
  candidates: readonly ArchiveCandidate[],
  loadedReleaseDates: ReadonlySet<string>,
  maxArchives: number,
): readonly ArchiveCandidate[] {
  const missing = candidates.filter(
    (candidate) => !loadedReleaseDates.has(candidate.releaseDate),
  );

  return missing.reverse().slice(0, maxArchives);
}
