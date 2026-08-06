/** A single weekly download anchor scraped from the VG bulk PSI listing. */
export interface PsiWeeklyLink {
  /** Absolute URL of the zip. */
  readonly url: string;
  /** Anchor text as rendered on the page, e.g. "03 Aug 2026". This is what gets compared. */
  readonly label: string;
  /**
   * The zip's own filename without extension, e.g. "20260803" — used to name the run directory.
   * Taken straight off the URL rather than derived from the date, so the folder on disk always
   * matches the file it came from.
   */
  readonly fileStem: string;
}

/** Result of a listing scrape. */
export interface PsiListingResult {
  /** Links newer than the reference label, newest first. */
  readonly links: PsiWeeklyLink[];
  /** Total anchors found in the weekly panel, before filtering. */
  readonly totalAnchors: number;
}
