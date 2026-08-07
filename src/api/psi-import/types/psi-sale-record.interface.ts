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

/** What downloading, parsing and inserting one week produced. */
export interface PsiWeekCounts {
  readonly datFileCount: number;
  readonly recordCount: number;
  /** Summed across the week's files. A jump here means the B layout has shifted at VG's end. */
  readonly malformedLines: number;
  readonly skippedRecords: number;
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
