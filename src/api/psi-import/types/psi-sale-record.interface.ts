/**
 * A parsed `B` (sale detail) record, keyed to the `property_sales_raw` column shape.
 *
 * `id` and `imported_at` are omitted — they are assigned by the database on insert, which this
 * iteration does not do.
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

/** Aggregate outcome of one week's worth of work. */
export interface PsiWeekResult {
  readonly link: { label: string; fileStem: string };
  readonly zipPath: string;
  readonly datFileCount: number;
  readonly recordCount: number;
}
