export interface ArchiveCandidate {
  readonly url: string;
  readonly releaseDate: string;
}

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
