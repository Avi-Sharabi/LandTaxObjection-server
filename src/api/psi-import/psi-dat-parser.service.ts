import { Injectable, Logger } from '@nestjs/common';
import { createReadStream } from 'fs';
import { basename } from 'path';
import { createInterface } from 'readline';

import {
  PSI_FIELD_DELIMITER,
  PSI_LOG_TAG,
  PSI_RECORD_TYPE_SALE,
} from './psi-import.constant';
import {
  PsiParsedFile,
  PsiSaleRecord,
} from './types/psi-sale-record.interface';

/**
 * Matches every timestamp shape seen in .DAT records:
 *   `20251021`             — contract_date / settlement_date
 *   `20260803 01:00`       — download_datetime, as published in B records
 *   `20260803 01:00:30`    — seconds tolerated, though not observed in practice
 *   `20260803010030`       — the packed form the published spec describes
 */
const DAT_TIMESTAMP_PATTERN =
  /^(\d{4})(\d{2})(\d{2})(?:[\sT]?(\d{2}):?(\d{2})(?::?(\d{2}))?)?$/;

/**
 * Parses a .DAT timestamp field. Returns null for empty or malformed values.
 *
 * Built in UTC so the parsed instant does not shift with the host's timezone, and so the date
 * round-trips to what the file actually says when rendered back by `formatPsiLabel`.
 *
 * Note for whoever wires up the insert: the 2.3M rows already in `property_sales_raw` were
 * loaded by a process that resolved the bare `YYYYMMDD` dates as midnight in ITS OWN local zone
 * (UTC+8 — e.g. `20251021` is stored as `2025-10-20T16:00:00Z`), while `download_datetime` was
 * stored as written. That offset is an artefact of where the legacy importer ran, not a property
 * of the data, so it is deliberately NOT reproduced here. Decide which convention to keep before
 * writing these values alongside the existing rows.
 */
function parseDatTimestamp(value: string): Date | null {
  const match = DAT_TIMESTAMP_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const hours = Number(match[4] ?? 0);
  const minutes = Number(match[5] ?? 0);
  const seconds = Number(match[6] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
}

/**
 * Positional layout of a `B` (sale detail) record in the NSW PSI "current" format (2001 onwards),
 * after the leading record-type marker. Maps 1:1 and in order onto the `property_sales_raw`
 * columns.
 *
 * VERIFIED against the 03 Aug 2026 weekly bundle: all 3,252 B records across 123 district files
 * split to exactly 25 fields, and every mapped value matched the corresponding live
 * `property_sales_raw` row. Spec reference:
 * https://www.nsw.gov.au/sites/default/files/noindex/2024-05/Current_Property_Sales_Data_File_Format_2001_to_Current.pdf
 *
 * `owner_type` occupies the final position but was empty in all 3,252 records — consistent with
 * the live table, where it is NULL across all 2.3M rows. It is mapped rather than dropped so the
 * layout stays aligned with the spec if VG ever starts populating it.
 *
 * The other record types are counted, not mapped: `C` carries the legal description
 * (`610/1289941`), `D` a purchaser/vendor marker (`P`/`V`), `Z` the trailer counts. None of them
 * feed a `property_sales_raw` column.
 */
const SALE_RECORD_FIELDS = [
  'district_code',
  'property_id',
  'sale_counter',
  'download_datetime',
  'property_name',
  'property_unit_number',
  'property_house_number',
  'property_street_name',
  'property_locality',
  'property_post_code',
  'area',
  'area_type',
  'contract_date',
  'settlement_date',
  'purchase_price',
  'zoning',
  'nature_of_property',
  'primary_purpose',
  'strata_lot_number',
  'component_code',
  'sale_code',
  'interest_of_sale_percent',
  'dealing_number',
  'owner_type',
] as const;

/** Fields carrying a YYYYMMDD or YYYYMMDDHHMMSS timestamp. */
const DATE_FIELDS = new Set([
  'download_datetime',
  'contract_date',
  'settlement_date',
]);

/** Fields coerced to numbers; everything else stays a trimmed string. */
const NUMERIC_FIELDS = new Set([
  'sale_counter',
  'area',
  'purchase_price',
  'interest_of_sale_percent',
]);

/**
 * Every observed record splits to 25 elements: the marker, 23 populated-capable fields, and the
 * always-empty `owner_type` slot before the terminating delimiter. Requiring 24 accepts a line
 * that omits only that trailing slot, while still rejecting genuinely truncated ones.
 */
const MINIMUM_SALE_RECORD_FIELDS = SALE_RECORD_FIELDS.length;

@Injectable()
export class PsiDatParserService {
  private readonly logger = new Logger(PsiDatParserService.name);

  /**
   * Parses one .DAT file into typed sale records.
   *
   * Read line-by-line over a stream rather than via `readFile`: a weekly bundle expands to well
   * over a hundred files and buffering them whole would be wasteful on a 512 MB heap.
   */
  async parseFile(datPath: string): Promise<PsiParsedFile> {
    const sourceFile = basename(datPath);
    const records: PsiSaleRecord[] = [];
    let skippedRecords = 0;
    let malformedLines = 0;

    const reader = createInterface({
      input: createReadStream(datPath, { encoding: 'latin1' }),
      crlfDelay: Infinity,
    });

    for await (const rawLine of reader) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      const fields = line.split(PSI_FIELD_DELIMITER);
      const recordType = fields[0]?.trim().toUpperCase();

      if (recordType !== PSI_RECORD_TYPE_SALE) {
        skippedRecords += 1;
        continue;
      }

      const record = this.toSaleRecord(fields, sourceFile);
      if (record === null) {
        malformedLines += 1;
        continue;
      }
      records.push(record);
    }

    return { sourceFile, records, skippedRecords, malformedLines };
  }

  /**
   * Dumps the first occurrence of each record type verbatim.
   *
   * The positional layout above is taken from the published spec, and this is how it gets
   * confirmed against a real file rather than trusted — particularly `owner_type`'s position.
   */
  async logSampleLines(datPath: string, maxPerType = 1): Promise<void> {
    const seen = new Map<string, number>();

    const reader = createInterface({
      input: createReadStream(datPath, { encoding: 'latin1' }),
      crlfDelay: Infinity,
    });

    for await (const rawLine of reader) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      const recordType =
        line.split(PSI_FIELD_DELIMITER)[0]?.trim().toUpperCase() || '?';
      const count = seen.get(recordType) ?? 0;
      if (count >= maxPerType) continue;

      seen.set(recordType, count + 1);
      this.logger.log(
        `${PSI_LOG_TAG}   raw ${recordType}-record (${basename(datPath)}): ${line}`,
      );
    }
  }

  /**
   * Maps a `B` record's fields onto the `property_sales_raw` column shape.
   * Returns null when the line has too few fields to be a real sale record.
   */
  private toSaleRecord(
    fields: string[],
    sourceFile: string,
  ): PsiSaleRecord | null {
    // Trailing empty fields still produce delimiters, so a genuine record always splits to at
    // least marker + 24. Anything shorter is malformed rather than sparse.
    if (fields.length < MINIMUM_SALE_RECORD_FIELDS) return null;

    const record: Partial<PsiSaleRecord> = { source_file: sourceFile };

    SALE_RECORD_FIELDS.forEach((field, index) => {
      const raw = fields[index + 1] ?? '';
      const value = this.emptyToNull(raw);

      if (value === null) {
        record[field] = null as never;
        return;
      }
      if (DATE_FIELDS.has(field)) {
        record[field] = parseDatTimestamp(value) as never;
        return;
      }
      if (NUMERIC_FIELDS.has(field)) {
        const parsed = Number(value);
        record[field] = (Number.isFinite(parsed) ? parsed : null) as never;
        return;
      }
      record[field] = value as never;
    });

    return record as PsiSaleRecord;
  }

  /** Empty and whitespace-only fields become null, never '', to match the nullable columns. */
  private emptyToNull(value: string | undefined): string | null {
    const trimmed = value?.trim() ?? '';
    return trimmed.length === 0 ? null : trimmed;
  }
}
