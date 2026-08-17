/**
 * A parsed `B` (sale detail) record, keyed to the `property_sales_raw` column shape.
 *
 * `id` is omitted (database-assigned). `imported_at` is omitted here but stamped by
 * `PsiImportRepository.insertSaleRecords` rather than left to a column default.
 */
export interface PsiSaleRecord {
  source_file: string | null;
  district_code: string | null;
  property_id: string | null;
  sale_counter: number | null;
  download_datetime: Date | null;
  property_name: string | null;
  property_unit_number: string | null;
  property_house_number: string | null;
  property_street_name: string | null;
  property_locality: string | null;
  property_post_code: string | null;
  area: number | null;
  area_type: string | null;
  contract_date: Date | null;
  settlement_date: Date | null;
  purchase_price: number | null;
  zoning: string | null;
  nature_of_property: string | null;
  primary_purpose: string | null;
  strata_lot_number: string | null;
  component_code: string | null;
  sale_code: string | null;
  interest_of_sale_percent: number | null;
  dealing_number: string | null;
  owner_type: string | null;
}

/** Outcome of parsing one .DAT file. */
export interface PsiParsedFile {
  /** Basename of the .DAT file, stored as `source_file` on each record. */
  readonly sourceFile: string;
  readonly records: PsiSaleRecord[];
  /** Count of A/C/D/Z records seen and deliberately not mapped. */
  readonly skippedRecords: number;
  /** Count of lines that looked like sale records but could not be parsed. */
  readonly malformedLines: number;
}

/** What writing one .DAT file's records actually achieved. */
export interface PsiInsertOutcome {
  /** Rows the database accepted. */
  readonly inserted: number;
  /**
   * Rows `ON CONFLICT DO NOTHING` discarded — almost always `uq_psr_dealing_number`, because one
   * land-title dealing covers several properties. Expected to be non-zero every week.
   */
  readonly suppressed: number;
  /**
   * Records whose `area_type` was neither `M` nor `H` and was stored as null instead.
   *
   * Counted before the insert, so a record can appear in both this and `suppressed` — they measure
   * different things (a field that could not be mapped vs a row that never landed) and are not
   * mutually exclusive.
   */
  readonly unmappedAreaType: number;
}

/**
 * Mutable carrier for the counts a rolled-back week still legitimately observed.
 *
 * Its shape *is* the distinction it exists for. A failed week rolls back, so `recordCount` and
 * `suppressedRows` are genuinely zero — nothing was stored, nothing was durably discarded. The four
 * fields here are **parser observations**, not database state: a rollback does not un-malform a
 * line or un-extract a file. Reporting them as zero on the failure path loses exactly the signal
 * that explains the failure — `malformedLines` above all, since a jump in it means VG changed the
 * record layout.
 *
 * One instance per week, created inside `processWeeks`' loop. Hoisting it above the loop would leak
 * one week's counts into the next week's failure report.
 */
export interface PsiWeekProgress {
  datFileCount: number;
  malformedLines: number;
  skippedRecords: number;
  unmappedAreaType: number;
}

/** What downloading, parsing and inserting one week produced. */
export interface PsiWeekCounts {
  readonly datFileCount: number;
  /** Rows actually written, not rows parsed — `suppressedRows` accounts for the difference. */
  readonly recordCount: number;
  /** Summed across the week's files. A jump here means the B layout has shifted at VG's end. */
  readonly malformedLines: number;
  readonly skippedRecords: number;
  /**
   * Parsed rows the unique constraint on `dealing_number` rejected. A steady non-zero figure is
   * normal and is the accepted cost of leaving that constraint in place; a sudden jump is not.
   */
  readonly suppressedRows: number;
  /** Records carrying an `area_type` outside `M`/`H`. Expected to stay at zero. */
  readonly unmappedAreaType: number;
}

/**
 * Aggregate outcome of one week's worth of work, and the payload of the per-week log line.
 *
 * No `zipPath`: the archive is deleted before the week returns, so the path would name something
 * that no longer exists.
 */
export interface PsiWeekResult extends PsiWeekCounts {
  readonly link: { label: string; fileStem: string };
  readonly status: 'success' | 'failed';
  readonly durationMs: number;
  /** Failure message, or null when the week succeeded. */
  readonly error: string | null;
}
