/**
 * Box 5 of the pipeline — "parse the .dat file (including filtering)" — in
 * one file: turn a NSW Valuer General `.dat` file into `property_sales_raw`
 * shaped rows.
 *
 * Consolidated from 6 previously-separate files, all ported from
 * nsw-property-sales-poc/src/parsing/ and src/validation/: record-parser.ts,
 * dat-file-parser.ts, coercers.ts, schema-contract.ts, sale-row.mapper.ts
 * (originally sale-validator.ts), sale-filter.ts (new). Sectioned in
 * dependency order — schema contract, coercion, record parsing, file-level
 * parsing, row mapping, then the content filter — rather than split across
 * files, since nothing outside this module needs any piece independently.
 *
 * `.dat` files are semicolon-delimited, not pipe-delimited. Record types
 * `A` (header) / `B` (sale) / `C` (legal description) / `D` (ownership) /
 * `Z` (trailer), every line with a trailing `;`:
 *
 *   A  6 elements  A;fileType;districtCode;downloadDateTime;submittingUserId;
 *   B 25 elements  B;district;propertyId;saleCounter;downloadDateTime;propertyName;
 *                    unitNumber;houseNumber;streetName;locality;postCode;area;areaType;
 *                    contractDate;settlementDate;purchasePrice;zoning;natureOfProperty;
 *                    primaryPurpose;strataLotNumber;componentCode;saleCode;
 *                    interestOfSalePercent;dealingNumber;
 *   C  7 elements  C;district;propertyId;saleCounter;downloadDateTime;legalDescription;
 *   D 12 elements  D;district;propertyId;saleCounter;downloadDateTime;ownerType;;;;;;
 *   Z  6 elements  Z;totalLines;bCount;cCount;dCount;
 *
 * The literal 'B' at parts[0] is a record-type marker, not a data value — it
 * is what selects a line as a sale record, and is dropped once selected; the
 * mapped fields start at parts[1] (districtCode). Confirmed empirically: a
 * full scan of the real 2026-08-03 archive found sale_code blank on 3,251 of
 * 3,252 rows and never equal to "B", and the same holds across all 31
 * archives available locally (109,025 real sale records, zero literal "B").
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import { PropertySalesIngestionException } from './exceptions';
import type { PropertySalesConfig } from './property-sales.config';

// ─────────────────────────────────────────────────────────────────────────
// Schema contract — a TypeScript mirror of `property_sales_raw`'s column
// constraints, from `comparable-sales-data/schema-creation.sql`. This does
// not parse that SQL at runtime — it is a hand-checked restatement used to
// validate and coerce incoming fields before KAN-242 ever binds them into
// an INSERT. Keep it in sync with the reference SQL by hand if it changes.
// ─────────────────────────────────────────────────────────────────────────

export const AREA_TYPE_VALUES = ['M', 'H'] as const;
export type AreaType = (typeof AREA_TYPE_VALUES)[number];

export const SALE_COUNTER_BOUNDS = { min: -32768, max: 32767 }; // SMALLINT

export const SCHEMA_CONTRACT = {
  sourceFile: { maxLength: 255 }, // VARCHAR(255) NOT NULL
  districtCode: { maxLength: 10 }, // VARCHAR(10)
  propertyId: { maxLength: 50 }, // VARCHAR(50)
  propertyName: { maxLength: 255 }, // VARCHAR(255)
  propertyUnitNumber: { maxLength: 50 }, // VARCHAR(50)
  propertyHouseNumber: { maxLength: 50 }, // VARCHAR(50)
  propertyStreetName: { maxLength: 255 }, // VARCHAR(255)
  propertyLocality: { maxLength: 100 }, // VARCHAR(100)
  propertyPostCode: { maxLength: 4 }, // CHAR(4)
  area: { precision: 15, scale: 4 }, // NUMERIC(15,4)
  purchasePrice: { precision: 15, scale: 2 }, // NUMERIC(15,2)
  zoning: { maxLength: 20 }, // VARCHAR(20)
  natureOfProperty: { maxLength: 50 }, // VARCHAR(50)
  primaryPurpose: { maxLength: 50 }, // VARCHAR(50)
  strataLotNumber: { maxLength: 50 }, // VARCHAR(50)
  componentCode: { maxLength: 20 }, // VARCHAR(20)
  saleCode: { maxLength: 20 }, // VARCHAR(20)
  interestOfSalePercent: { precision: 5, scale: 2 }, // NUMERIC(5,2)
  dealingNumber: { maxLength: 50 }, // VARCHAR(50)
  // owner_type VARCHAR(50) has no direct source column — it is derived from
  // this sale's D records. See deriveOwnerTypeRaw below.
  ownerType: { maxLength: 50 },
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Coercion — field-level coercion from raw DAT strings to values safe to
// bind into `property_sales_raw`. Pure — no I/O, no knowledge of which sale
// a field belongs to. A blank source value always becomes `null` (nullable
// columns) — never a silent default. A non-blank value that fails its rule
// throws `CoercionError`, which the caller turns into a rejection; nothing
// is ever dropped without a reason attached.
// ─────────────────────────────────────────────────────────────────────────

export type CoercionRule =
  | 'MAX_LENGTH_EXCEEDED'
  | 'INVALID_DATE'
  | 'INVALID_DATETIME'
  | 'INVALID_INTEGER'
  | 'INTEGER_OUT_OF_RANGE'
  | 'INVALID_NUMERIC'
  | 'NUMERIC_OUT_OF_RANGE'
  | 'ENUM_MISMATCH';

export class CoercionError extends Error {
  readonly field: string;
  readonly value: string;
  readonly rule: CoercionRule;

  constructor(
    field: string,
    value: string,
    rule: CoercionRule,
    message: string,
  ) {
    super(message);
    this.name = 'CoercionError';
    this.field = field;
    this.value = value;
    this.rule = rule;
  }
}

function isBlank(value: string): boolean {
  return value === '';
}

/** `VARCHAR(maxLength)` / `CHAR(maxLength)`: blank -> null, else length-checked. */
export function toNullableVarchar(
  value: string,
  field: string,
  maxLength: number,
): string | null {
  if (isBlank(value)) return null;
  if (value.length > maxLength) {
    throw new CoercionError(
      field,
      value,
      'MAX_LENGTH_EXCEEDED',
      `${field} is ${value.length} characters, over the ${maxLength} character limit`,
    );
  }
  return value;
}

const DATE_PATTERN = /^\d{8}$/;

/** Validates a real calendar date, not just eight digits — rejects e.g. 20260230. */
function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (month < 1 || month > 12) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** `DATE` column from a `YYYYMMDD` source field. Blank -> null. */
export function toDateOrNull(value: string, field: string): string | null {
  if (isBlank(value)) return null;
  if (!DATE_PATTERN.test(value)) {
    throw new CoercionError(
      field,
      value,
      'INVALID_DATE',
      `${field} "${value}" is not in YYYYMMDD format`,
    );
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  if (!isValidCalendarDate(year, month, day)) {
    throw new CoercionError(
      field,
      value,
      'INVALID_DATE',
      `${field} "${value}" is not a real calendar date`,
    );
  }
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

const DATETIME_PATTERN = /^(\d{8}) (\d{2}):(\d{2})$/;

/**
 * `TIMESTAMPTZ` column from a `YYYYMMDD HH:mm` source field with no explicit
 * timezone. Returns a plain `YYYY-MM-DD HH:mm:00` string; KAN-242's insert
 * binds it with an explicit `AT TIME ZONE 'Australia/Sydney'` cast rather
 * than trusting any implicit zone. Blank -> null.
 */
export function toDownloadDatetimeOrNull(
  value: string,
  field: string,
): string | null {
  if (isBlank(value)) return null;
  const match = DATETIME_PATTERN.exec(value);
  if (!match) {
    throw new CoercionError(
      field,
      value,
      'INVALID_DATETIME',
      `${field} "${value}" is not in "YYYYMMDD HH:mm" format`,
    );
  }
  const [, datePart, hour, minute] = match as unknown as [
    string,
    string,
    string,
    string,
  ];
  const isoDate = toDateOrNull(datePart, field);
  if (isoDate === null) {
    // Unreachable: datePart matched \d{8} above, so toDateOrNull only rejects
    // an invalid calendar date, which still needs reporting as this field.
    throw new CoercionError(
      field,
      value,
      'INVALID_DATETIME',
      `${field} "${value}" has an invalid date part`,
    );
  }
  const hourNum = Number(hour);
  const minuteNum = Number(minute);
  if (hourNum > 23 || minuteNum > 59) {
    throw new CoercionError(
      field,
      value,
      'INVALID_DATETIME',
      `${field} "${value}" has an invalid time of day`,
    );
  }
  return `${isoDate} ${hour}:${minute}:00`;
}

const INTEGER_PATTERN = /^-?\d+$/;

/** `SMALLINT` (or any bounded integer) column. Blank -> null. */
export function toIntegerOrNull(
  value: string,
  field: string,
  bounds: { min: number; max: number },
): number | null {
  if (isBlank(value)) return null;
  if (!INTEGER_PATTERN.test(value)) {
    throw new CoercionError(
      field,
      value,
      'INVALID_INTEGER',
      `${field} "${value}" is not an integer`,
    );
  }
  const num = Number(value);
  if (num < bounds.min || num > bounds.max) {
    throw new CoercionError(
      field,
      value,
      'INTEGER_OUT_OF_RANGE',
      `${field} "${value}" is outside [${bounds.min}, ${bounds.max}]`,
    );
  }
  return num;
}

// The feed writes sub-unit values without the leading zero (".6", ".98" both
// appear as real areas), so the integer part is optional. The precision
// accounting below already treats an empty integer part as zero digits — this
// pattern is what kept that branch from ever being reached. Still strict
// otherwise: no trailing point ("1."), thousands separators, whitespace,
// leading "+", or exponents.
const NUMERIC_PATTERN = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * `NUMERIC(precision, scale)` column. Returned as a decimal string (not a
 * JS number) so `pg` binds it exactly — floats would silently round values
 * like `NUMERIC(15,4)` areas. Blank -> null.
 */
export function toNumericOrNull(
  value: string,
  field: string,
  limits: { precision: number; scale: number },
): string | null {
  if (isBlank(value)) return null;
  if (!NUMERIC_PATTERN.test(value)) {
    throw new CoercionError(
      field,
      value,
      'INVALID_NUMERIC',
      `${field} "${value}" is not a valid decimal number`,
    );
  }

  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integerPart = '', fractionPart = ''] = unsigned.split('.');
  // Postgres NUMERIC(p,s) counts precision as total significant digits
  // across both parts; a leading-zero integer part ("0.5") still counts as
  // one digit of precision, matching Postgres's own accounting.
  const integerDigits =
    integerPart === '' ? 0 : integerPart.replace(/^0+(?=\d)/, '').length || 1;
  const totalDigits = integerDigits + fractionPart.length;

  if (fractionPart.length > limits.scale || totalDigits > limits.precision) {
    throw new CoercionError(
      field,
      value,
      'NUMERIC_OUT_OF_RANGE',
      `${field} "${value}" exceeds NUMERIC(${limits.precision}, ${limits.scale})`,
    );
  }

  return value;
}

/** An enum-backed column. Blank -> null; anything else must be an allowed value. */
export function toEnumOrNull<T extends string>(
  value: string,
  field: string,
  allowed: readonly T[],
): T | null {
  if (isBlank(value)) return null;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new CoercionError(
      field,
      value,
      'ENUM_MISMATCH',
      `${field} "${value}" is not one of [${allowed.join(', ')}]`,
    );
  }
  return value as T;
}

// ─────────────────────────────────────────────────────────────────────────
// Record parsing — parses one semicolon-delimited DAT line into a typed
// record. Pure — no I/O. Every record type has a trailing `;`, which
// produces one extra empty element after `split(';')`; the expected
// lengths below include that trailing element, verified against the real
// sample archive.
// ─────────────────────────────────────────────────────────────────────────

export type RecordType = 'A' | 'B' | 'C' | 'D' | 'Z';

const KNOWN_RECORD_TYPES = new Set<string>(['A', 'B', 'C', 'D', 'Z']);

/** Expected `split(';')` length for each record type, trailing empty included. */
const EXPECTED_FIELD_COUNT: Record<RecordType, number> = {
  A: 6,
  B: 25,
  C: 7,
  D: 12,
  Z: 6,
};

/**
 * Where a record came from, kept on every parsed record so a rejection can
 * always be traced back to an exact source line — malformed records are
 * never silently discarded.
 */
export interface RecordProvenance {
  readonly sourceFile: string;
  readonly lineNumber: number;
  readonly rawLine: string;
}

export interface HeaderRecord extends RecordProvenance {
  readonly type: 'A';
  readonly fileType: string;
  readonly districtCode: string;
  readonly downloadDateTime: string;
  readonly submittingUserId: string;
}

/** Raw (uncoerced) fields, positionally identical to the schema's column order. */
export interface SaleRecordRaw extends RecordProvenance {
  readonly type: 'B';
  readonly districtCode: string;
  readonly propertyId: string;
  readonly saleCounter: string;
  readonly downloadDateTime: string;
  readonly propertyName: string;
  readonly propertyUnitNumber: string;
  readonly propertyHouseNumber: string;
  readonly propertyStreetName: string;
  readonly propertyLocality: string;
  readonly propertyPostCode: string;
  readonly area: string;
  readonly areaType: string;
  readonly contractDate: string;
  readonly settlementDate: string;
  readonly purchasePrice: string;
  readonly zoning: string;
  readonly natureOfProperty: string;
  readonly primaryPurpose: string;
  readonly strataLotNumber: string;
  readonly componentCode: string;
  readonly saleCode: string;
  readonly interestOfSalePercent: string;
  readonly dealingNumber: string;
}

export interface LegalDescriptionRecordRaw extends RecordProvenance {
  readonly type: 'C';
  readonly districtCode: string;
  readonly propertyId: string;
  readonly saleCounter: string;
  readonly downloadDateTime: string;
  readonly legalDescription: string;
}

export interface OwnershipRecordRaw extends RecordProvenance {
  readonly type: 'D';
  readonly districtCode: string;
  readonly propertyId: string;
  readonly saleCounter: string;
  readonly downloadDateTime: string;
  readonly ownerType: string;
}

export interface TrailerRecord extends RecordProvenance {
  readonly type: 'Z';
  readonly totalLines: string;
  readonly bCount: string;
  readonly cCount: string;
  readonly dCount: string;
}

export type ParsedRecord =
  | HeaderRecord
  | SaleRecordRaw
  | LegalDescriptionRecordRaw
  | OwnershipRecordRaw
  | TrailerRecord;

/** The natural key shared by a B record and its C/D children. */
export function saleKey(
  record: SaleRecordRaw | LegalDescriptionRecordRaw | OwnershipRecordRaw,
): string {
  return `${record.districtCode}|${record.propertyId}|${record.saleCounter}`;
}

/** Groups C or D records by the sale key of the B record they belong to. */
export function groupBySaleKey<
  T extends LegalDescriptionRecordRaw | OwnershipRecordRaw,
>(records: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const key = saleKey(record);
    const list = grouped.get(key);
    if (list) {
      list.push(record);
    } else {
      grouped.set(key, [record]);
    }
  }
  return grouped;
}

function parseHeader(
  parts: readonly string[],
  provenance: RecordProvenance,
): HeaderRecord {
  return {
    ...provenance,
    type: 'A',
    fileType: parts[1] ?? '',
    districtCode: parts[2] ?? '',
    downloadDateTime: parts[3] ?? '',
    submittingUserId: parts[4] ?? '',
  };
}

function parseSale(
  parts: readonly string[],
  provenance: RecordProvenance,
): SaleRecordRaw {
  return {
    ...provenance,
    type: 'B',
    districtCode: parts[1] ?? '',
    propertyId: parts[2] ?? '',
    saleCounter: parts[3] ?? '',
    downloadDateTime: parts[4] ?? '',
    propertyName: parts[5] ?? '',
    propertyUnitNumber: parts[6] ?? '',
    propertyHouseNumber: parts[7] ?? '',
    propertyStreetName: parts[8] ?? '',
    propertyLocality: parts[9] ?? '',
    propertyPostCode: parts[10] ?? '',
    area: parts[11] ?? '',
    areaType: parts[12] ?? '',
    contractDate: parts[13] ?? '',
    settlementDate: parts[14] ?? '',
    purchasePrice: parts[15] ?? '',
    zoning: parts[16] ?? '',
    natureOfProperty: parts[17] ?? '',
    primaryPurpose: parts[18] ?? '',
    strataLotNumber: parts[19] ?? '',
    componentCode: parts[20] ?? '',
    saleCode: parts[21] ?? '',
    interestOfSalePercent: parts[22] ?? '',
    dealingNumber: parts[23] ?? '',
  };
}

function parseLegalDescription(
  parts: readonly string[],
  provenance: RecordProvenance,
): LegalDescriptionRecordRaw {
  return {
    ...provenance,
    type: 'C',
    districtCode: parts[1] ?? '',
    propertyId: parts[2] ?? '',
    saleCounter: parts[3] ?? '',
    downloadDateTime: parts[4] ?? '',
    legalDescription: parts[5] ?? '',
  };
}

function parseOwnership(
  parts: readonly string[],
  provenance: RecordProvenance,
): OwnershipRecordRaw {
  return {
    ...provenance,
    type: 'D',
    districtCode: parts[1] ?? '',
    propertyId: parts[2] ?? '',
    saleCounter: parts[3] ?? '',
    downloadDateTime: parts[4] ?? '',
    ownerType: parts[5] ?? '',
  };
}

function parseTrailer(
  parts: readonly string[],
  provenance: RecordProvenance,
): TrailerRecord {
  return {
    ...provenance,
    type: 'Z',
    totalLines: parts[1] ?? '',
    bCount: parts[2] ?? '',
    cCount: parts[3] ?? '',
    dCount: parts[4] ?? '',
  };
}

/**
 * Parses one non-empty DAT line. Throws `PARSE_UNKNOWN_RECORD_TYPE` for a
 * leading character outside A/B/C/D/Z, and `PARSE_FIELD_COUNT_MISMATCH` when
 * the field count for that type doesn't match — both are structural
 * failures the caller should treat as fatal for the whole file, since they
 * indicate either corruption or an undocumented format change.
 */
export function parseRecordLine(
  line: string,
  context: { sourceFile: string; lineNumber: number },
): ParsedRecord {
  const parts = line.split(';');
  const recordType = parts[0] ?? '';

  if (!KNOWN_RECORD_TYPES.has(recordType)) {
    throw new PropertySalesIngestionException(
      'PARSE_UNKNOWN_RECORD_TYPE',
      `Unknown record type "${recordType}" in ${context.sourceFile}:${context.lineNumber}`,
      { context: { ...context, recordType, rawLine: line } },
    );
  }

  const type = recordType as RecordType;
  const expected = EXPECTED_FIELD_COUNT[type];
  if (parts.length !== expected) {
    throw new PropertySalesIngestionException(
      'PARSE_FIELD_COUNT_MISMATCH',
      `${type} record in ${context.sourceFile}:${context.lineNumber} has ${parts.length} fields, expected ${expected}`,
      {
        context: {
          ...context,
          recordType: type,
          expected,
          actual: parts.length,
          rawLine: line,
        },
      },
    );
  }

  const provenance: RecordProvenance = {
    sourceFile: context.sourceFile,
    lineNumber: context.lineNumber,
    rawLine: line,
  };

  switch (type) {
    case 'A':
      return parseHeader(parts, provenance);
    case 'B':
      return parseSale(parts, provenance);
    case 'C':
      return parseLegalDescription(parts, provenance);
    case 'D':
      return parseOwnership(parts, provenance);
    case 'Z':
      return parseTrailer(parts, provenance);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// File-level parsing — streams a single DAT file line by line, parses every
// record, and reconciles the trailing Z record's counts against what was
// actually read. The Z trailer is an exact checksum:
// `1 (header) + bCount + cCount + dCount + 1 (trailer) === totalLines`,
// verified against 123/123 files in the real sample archive and all 3,759
// .dat files across the 31 archives available locally. A mismatch is a
// structural failure — fatal for the whole file, not a skipped row.
// ─────────────────────────────────────────────────────────────────────────

export interface ParsedDatFile {
  readonly sourceFile: string;
  readonly header: HeaderRecord;
  readonly sales: readonly SaleRecordRaw[];
  readonly legalDescriptions: readonly LegalDescriptionRecordRaw[];
  readonly ownerships: readonly OwnershipRecordRaw[];
  readonly trailer: TrailerRecord;
  readonly lineCount: number;
}

function parseTrailerCount(
  value: string,
  field: string,
  sourceFile: string,
): number {
  if (!/^\d+$/.test(value)) {
    throw new PropertySalesIngestionException(
      'PARSE_TRAILER_MISMATCH',
      `Z trailer field "${field}" in ${sourceFile} is not a non-negative integer: "${value}"`,
      { context: { sourceFile, field, value } },
    );
  }
  return Number(value);
}

/**
 * Real NSW archives are not guaranteed to be pure ASCII; decode as latin1
 * (a strict superset of ASCII that never throws on any byte value) rather
 * than assuming UTF-8, which would corrupt or reject non-ASCII bytes.
 */
const DAT_ENCODING = 'latin1';

export async function parseDatFile(
  absolutePath: string,
  sourceFile: string,
): Promise<ParsedDatFile> {
  const rl = createInterface({
    input: createReadStream(absolutePath, { encoding: DAT_ENCODING }),
    crlfDelay: Infinity,
  });

  let header: HeaderRecord | undefined;
  let trailer: TrailerRecord | undefined;
  const sales: SaleRecordRaw[] = [];
  const legalDescriptions: LegalDescriptionRecordRaw[] = [];
  const ownerships: OwnershipRecordRaw[] = [];
  let lineCount = 0;
  let lineNumber = 0;

  for await (const rawLine of rl) {
    lineNumber += 1;
    if (rawLine === '') continue; // Tolerate a stray blank line; it is not counted.

    const record = parseRecordLine(rawLine, { sourceFile, lineNumber });
    lineCount += 1;

    switch (record.type) {
      case 'A':
        if (header !== undefined) {
          throw new PropertySalesIngestionException(
            'PARSE_TRAILER_MISMATCH',
            `${sourceFile} contains more than one A header record`,
            { context: { sourceFile, lineNumber } },
          );
        }
        if (lineCount !== 1) {
          throw new PropertySalesIngestionException(
            'PARSE_MISSING_HEADER',
            `${sourceFile} does not begin with an A header record`,
            { context: { sourceFile, lineNumber } },
          );
        }
        header = record;
        break;
      case 'B':
        sales.push(record);
        break;
      case 'C':
        legalDescriptions.push(record);
        break;
      case 'D':
        ownerships.push(record);
        break;
      case 'Z':
        if (trailer !== undefined) {
          throw new PropertySalesIngestionException(
            'PARSE_TRAILER_MISMATCH',
            `${sourceFile} contains more than one Z trailer record`,
            { context: { sourceFile, lineNumber } },
          );
        }
        trailer = record;
        break;
    }
  }

  if (header === undefined) {
    throw new PropertySalesIngestionException(
      'PARSE_MISSING_HEADER',
      `${sourceFile} has no A header record`,
      {
        context: { sourceFile },
      },
    );
  }
  if (trailer === undefined) {
    throw new PropertySalesIngestionException(
      'PARSE_MISSING_TRAILER',
      `${sourceFile} has no Z trailer record`,
      {
        context: { sourceFile },
      },
    );
  }

  const declaredTotal = parseTrailerCount(
    trailer.totalLines,
    'totalLines',
    sourceFile,
  );
  const declaredB = parseTrailerCount(trailer.bCount, 'bCount', sourceFile);
  const declaredC = parseTrailerCount(trailer.cCount, 'cCount', sourceFile);
  const declaredD = parseTrailerCount(trailer.dCount, 'dCount', sourceFile);

  const expectedTotal = 1 + declaredB + declaredC + declaredD + 1; // 1 header + ... + 1 trailer
  if (expectedTotal !== declaredTotal) {
    throw new PropertySalesIngestionException(
      'PARSE_TRAILER_MISMATCH',
      `${sourceFile} Z trailer is internally inconsistent: totalLines=${declaredTotal} but ` +
        `1 + bCount(${declaredB}) + cCount(${declaredC}) + dCount(${declaredD}) + 1 = ${expectedTotal}`,
      {
        context: {
          sourceFile,
          declaredTotal,
          declaredB,
          declaredC,
          declaredD,
          expectedTotal,
        },
      },
    );
  }

  if (lineCount !== declaredTotal) {
    throw new PropertySalesIngestionException(
      'PARSE_TRAILER_MISMATCH',
      `${sourceFile} Z trailer declares ${declaredTotal} total lines but ${lineCount} were read`,
      { context: { sourceFile, declaredTotal, actualLineCount: lineCount } },
    );
  }
  if (sales.length !== declaredB) {
    throw new PropertySalesIngestionException(
      'PARSE_TRAILER_MISMATCH',
      `${sourceFile} Z trailer declares ${declaredB} B records but ${sales.length} were read`,
      { context: { sourceFile, declaredB, actual: sales.length } },
    );
  }
  if (legalDescriptions.length !== declaredC) {
    throw new PropertySalesIngestionException(
      'PARSE_TRAILER_MISMATCH',
      `${sourceFile} Z trailer declares ${declaredC} C records but ${legalDescriptions.length} were read`,
      { context: { sourceFile, declaredC, actual: legalDescriptions.length } },
    );
  }
  if (ownerships.length !== declaredD) {
    throw new PropertySalesIngestionException(
      'PARSE_TRAILER_MISMATCH',
      `${sourceFile} Z trailer declares ${declaredD} D records but ${ownerships.length} were read`,
      { context: { sourceFile, declaredD, actual: ownerships.length } },
    );
  }

  return {
    sourceFile,
    header,
    sales,
    legalDescriptions,
    ownerships,
    trailer,
    lineCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Sale row mapping — joins one B (sale) record with its D (ownership)
// children and coerces it into a `property_sales_raw`-shaped row, or a set
// of rejections if any field fails its rule. Every field is attempted
// independently — one bad field does not stop the others from being
// checked — so a rejected sale's report shows every problem at once. A
// rejected row is excluded from the archive's output and reported, never
// silently dropped; it does NOT abort the rest of the file.
// ─────────────────────────────────────────────────────────────────────────

export interface SaleRow {
  readonly sourceFile: string;
  readonly districtCode: string | null;
  readonly propertyId: string | null;
  readonly saleCounter: number | null;
  readonly downloadDatetime: string | null;
  readonly propertyName: string | null;
  readonly propertyUnitNumber: string | null;
  readonly propertyHouseNumber: string | null;
  readonly propertyStreetName: string | null;
  readonly propertyLocality: string | null;
  readonly propertyPostCode: string | null;
  readonly area: string | null;
  readonly areaType: AreaType | null;
  readonly contractDate: string | null;
  readonly settlementDate: string | null;
  readonly purchasePrice: string | null;
  readonly zoning: string | null;
  readonly natureOfProperty: string | null;
  readonly primaryPurpose: string | null;
  readonly strataLotNumber: string | null;
  readonly componentCode: string | null;
  readonly saleCode: string | null;
  readonly interestOfSalePercent: string | null;
  readonly dealingNumber: string | null;
  /** Derived from this sale's D records; see deriveOwnerTypeRaw below. */
  readonly ownerType: string | null;
}

export interface RejectedRecord {
  readonly sourceFile: string;
  readonly lineNumber: number;
  readonly recordType: 'B';
  readonly rawLine: string;
  readonly saleKey: string;
  readonly rule: string;
  readonly field: string;
  readonly value: string;
}

export interface SaleMappingOutcome {
  readonly row: SaleRow | null;
  readonly rejections: readonly RejectedRecord[];
}

/**
 * Derives `owner_type` as the sorted, comma-joined set of distinct D-record
 * owner types for this sale (e.g. `'P,V'`, `'P'`, `'V'`). Blank D values are
 * ignored. Returns `''` (which coerces to NULL) when there are none.
 */
export function deriveOwnerTypeRaw(
  ownerships: readonly OwnershipRecordRaw[],
): string {
  const distinct = [
    ...new Set(ownerships.map((o) => o.ownerType).filter((v) => v !== '')),
  ].sort();
  return distinct.join(',');
}

function attempt<T>(
  fn: () => T,
  onError: (err: CoercionError) => void,
): T | null {
  try {
    return fn();
  } catch (err) {
    if (err instanceof CoercionError) {
      onError(err);
      return null;
    }
    throw err;
  }
}

export function mapSaleRow(
  sale: SaleRecordRaw,
  ownerships: readonly OwnershipRecordRaw[],
): SaleMappingOutcome {
  const rejections: RejectedRecord[] = [];
  const key = saleKey(sale);
  const recordError = (err: CoercionError): void => {
    rejections.push({
      sourceFile: sale.sourceFile,
      lineNumber: sale.lineNumber,
      recordType: 'B',
      rawLine: sale.rawLine,
      saleKey: key,
      rule: err.rule,
      field: err.field,
      value: err.value,
    });
  };

  // sale.sourceFile is always populated by the parser (never blank in practice), so the
  // null branch here is unreachable — this call exists purely so an over-length filename
  // is rejected as a RejectedRecord instead of raising a raw Postgres error mid-transaction
  // once KAN-242 inserts it. The row's sourceFile is still set from sale.sourceFile directly
  // below, since SaleRow.sourceFile is typed as string, not string | null.
  attempt(
    () =>
      toNullableVarchar(
        sale.sourceFile,
        'source_file',
        SCHEMA_CONTRACT.sourceFile.maxLength,
      ),
    recordError,
  );

  const districtCode = attempt(
    () =>
      toNullableVarchar(
        sale.districtCode,
        'district_code',
        SCHEMA_CONTRACT.districtCode.maxLength,
      ),
    recordError,
  );
  const propertyId = attempt(
    () =>
      toNullableVarchar(
        sale.propertyId,
        'property_id',
        SCHEMA_CONTRACT.propertyId.maxLength,
      ),
    recordError,
  );
  const saleCounter = attempt(
    () =>
      toIntegerOrNull(sale.saleCounter, 'sale_counter', SALE_COUNTER_BOUNDS),
    recordError,
  );
  const downloadDatetime = attempt(
    () => toDownloadDatetimeOrNull(sale.downloadDateTime, 'download_datetime'),
    recordError,
  );
  const propertyName = attempt(
    () =>
      toNullableVarchar(
        sale.propertyName,
        'property_name',
        SCHEMA_CONTRACT.propertyName.maxLength,
      ),
    recordError,
  );
  const propertyUnitNumber = attempt(
    () =>
      toNullableVarchar(
        sale.propertyUnitNumber,
        'property_unit_number',
        SCHEMA_CONTRACT.propertyUnitNumber.maxLength,
      ),
    recordError,
  );
  const propertyHouseNumber = attempt(
    () =>
      toNullableVarchar(
        sale.propertyHouseNumber,
        'property_house_number',
        SCHEMA_CONTRACT.propertyHouseNumber.maxLength,
      ),
    recordError,
  );
  const propertyStreetName = attempt(
    () =>
      toNullableVarchar(
        sale.propertyStreetName,
        'property_street_name',
        SCHEMA_CONTRACT.propertyStreetName.maxLength,
      ),
    recordError,
  );
  const propertyLocality = attempt(
    () =>
      toNullableVarchar(
        sale.propertyLocality,
        'property_locality',
        SCHEMA_CONTRACT.propertyLocality.maxLength,
      ),
    recordError,
  );
  const propertyPostCode = attempt(
    () =>
      toNullableVarchar(
        sale.propertyPostCode,
        'property_post_code',
        SCHEMA_CONTRACT.propertyPostCode.maxLength,
      ),
    recordError,
  );
  const area = attempt(
    () => toNumericOrNull(sale.area, 'area', SCHEMA_CONTRACT.area),
    recordError,
  );
  const areaType = attempt(
    () => toEnumOrNull(sale.areaType, 'area_type', AREA_TYPE_VALUES),
    recordError,
  );
  const contractDate = attempt(
    () => toDateOrNull(sale.contractDate, 'contract_date'),
    recordError,
  );
  const settlementDate = attempt(
    () => toDateOrNull(sale.settlementDate, 'settlement_date'),
    recordError,
  );
  const purchasePrice = attempt(
    () =>
      toNumericOrNull(
        sale.purchasePrice,
        'purchase_price',
        SCHEMA_CONTRACT.purchasePrice,
      ),
    recordError,
  );
  const zoning = attempt(
    () =>
      toNullableVarchar(
        sale.zoning,
        'zoning',
        SCHEMA_CONTRACT.zoning.maxLength,
      ),
    recordError,
  );
  const natureOfProperty = attempt(
    () =>
      toNullableVarchar(
        sale.natureOfProperty,
        'nature_of_property',
        SCHEMA_CONTRACT.natureOfProperty.maxLength,
      ),
    recordError,
  );
  const primaryPurpose = attempt(
    () =>
      toNullableVarchar(
        sale.primaryPurpose,
        'primary_purpose',
        SCHEMA_CONTRACT.primaryPurpose.maxLength,
      ),
    recordError,
  );
  const strataLotNumber = attempt(
    () =>
      toNullableVarchar(
        sale.strataLotNumber,
        'strata_lot_number',
        SCHEMA_CONTRACT.strataLotNumber.maxLength,
      ),
    recordError,
  );
  const componentCode = attempt(
    () =>
      toNullableVarchar(
        sale.componentCode,
        'component_code',
        SCHEMA_CONTRACT.componentCode.maxLength,
      ),
    recordError,
  );
  const saleCode = attempt(
    () =>
      toNullableVarchar(
        sale.saleCode,
        'sale_code',
        SCHEMA_CONTRACT.saleCode.maxLength,
      ),
    recordError,
  );
  const interestOfSalePercent = attempt(
    () =>
      toNumericOrNull(
        sale.interestOfSalePercent,
        'interest_of_sale_percent',
        SCHEMA_CONTRACT.interestOfSalePercent,
      ),
    recordError,
  );
  const dealingNumber = attempt(
    () =>
      toNullableVarchar(
        sale.dealingNumber,
        'dealing_number',
        SCHEMA_CONTRACT.dealingNumber.maxLength,
      ),
    recordError,
  );
  const ownerType = attempt(
    () =>
      toNullableVarchar(
        deriveOwnerTypeRaw(ownerships),
        'owner_type',
        SCHEMA_CONTRACT.ownerType.maxLength,
      ),
    recordError,
  );

  if (rejections.length > 0) {
    return { row: null, rejections };
  }

  return {
    row: {
      sourceFile: sale.sourceFile,
      districtCode,
      propertyId,
      saleCounter,
      downloadDatetime,
      propertyName,
      propertyUnitNumber,
      propertyHouseNumber,
      propertyStreetName,
      propertyLocality,
      propertyPostCode,
      area,
      areaType,
      contractDate,
      settlementDate,
      purchasePrice,
      zoning,
      natureOfProperty,
      primaryPurpose,
      strataLotNumber,
      componentCode,
      saleCode,
      interestOfSalePercent,
      dealingNumber,
      ownerType,
    },
    rejections: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Content filter — the configurable exclusion seam, layered on top of the
// mandatory record-type mechanics above (keep B records, drop A/C/Z, drop
// the leading 'B' marker). This exists because of a still-unconfirmed
// business rule: "the filtering removes rows with a value of 'B'". A full
// scan of the real 2026-08-03 archive and all 74,362 historical
// comparable-sales-data CSVs found sale_code blank on all but one row and
// never equal to "B" in either field, so the rule as literally described
// would be a no-op against real data. Rather than guess, this is a
// configurable seam, off by default: once the actual rule is confirmed,
// enabling it is an env-var change (PSI_EXCLUDE_SALE_CODES /
// PSI_EXCLUDE_ZONINGS on PropertySalesConfig), not a code change.
// ─────────────────────────────────────────────────────────────────────────

export interface SaleFilterResult {
  readonly included: readonly SaleRow[];
  readonly excludedCount: number;
}

export function applySaleFilters(
  rows: readonly SaleRow[],
  config: Pick<PropertySalesConfig, 'excludedSaleCodes' | 'excludedZonings'>,
): SaleFilterResult {
  if (
    config.excludedSaleCodes.size === 0 &&
    config.excludedZonings.size === 0
  ) {
    return { included: rows, excludedCount: 0 };
  }

  const included = rows.filter((row) => {
    const saleCode = row.saleCode?.toUpperCase() ?? '';
    const zoning = row.zoning?.toUpperCase() ?? '';
    return (
      !config.excludedSaleCodes.has(saleCode) &&
      !config.excludedZonings.has(zoning)
    );
  });

  return { included, excludedCount: rows.length - included.length };
}
