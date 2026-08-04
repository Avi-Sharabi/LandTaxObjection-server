import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PropertySalesIngestionException } from './exceptions';
import {
  applySaleFilters,
  CoercionError,
  deriveOwnerTypeRaw,
  type LegalDescriptionRecordRaw,
  mapSaleRow,
  type OwnershipRecordRaw,
  parseDatFile,
  parseRecordLine,
  type SaleRecordRaw,
  saleKey,
  type SaleRow,
  toDateOrNull,
  toDownloadDatetimeOrNull,
  toEnumOrNull,
  toIntegerOrNull,
  toNullableVarchar,
  toNumericOrNull,
} from './dat-parser';

// ─────────────────────────────────────────────────────────────────────────
// Record parsing
// ─────────────────────────────────────────────────────────────────────────

describe('parseRecordLine', () => {
  const CTX = { sourceFile: '001_SALES_DATA.DAT', lineNumber: 1 };

  it('parses an A header record', () => {
    const record = parseRecordLine(
      'A;RTSALEDATA;001;20260727 01:00;VALNET;',
      CTX,
    );
    expect(record).toMatchObject({
      type: 'A',
      fileType: 'RTSALEDATA',
      districtCode: '001',
      downloadDateTime: '20260727 01:00',
      submittingUserId: 'VALNET',
    });
  });

  it('parses a B sale record with every field in position, dropping the leading "B" marker', () => {
    const line =
      'B;001;2892712;1;20260727 01:00;;;121;EGLINFORD LANE;CONGEWAI;2325;1.912;H;20260424;20260723;1065000;RU2;R;RESIDENCE;;RAH;;;AW320686;';
    const record = parseRecordLine(line, CTX);
    expect(record).toMatchObject({
      type: 'B',
      districtCode: '001',
      propertyId: '2892712',
      saleCounter: '1',
      propertyHouseNumber: '121',
      propertyStreetName: 'EGLINFORD LANE',
      propertyLocality: 'CONGEWAI',
      propertyPostCode: '2325',
      area: '1.912',
      areaType: 'H',
      contractDate: '20260424',
      settlementDate: '20260723',
      purchasePrice: '1065000',
      zoning: 'RU2',
      natureOfProperty: 'R',
      primaryPurpose: 'RESIDENCE',
      componentCode: 'RAH',
      dealingNumber: 'AW320686',
    });
  });

  it('parses a C legal-description record', () => {
    const record = parseRecordLine(
      'C;001;6069384;1;20260727 01:00;6/1106117;',
      CTX,
    );
    expect(record).toMatchObject({
      type: 'C',
      districtCode: '001',
      propertyId: '6069384',
      saleCounter: '1',
      legalDescription: '6/1106117',
    });
  });

  it('parses a D ownership record', () => {
    const record = parseRecordLine(
      'D;002;6069384;1;20260727 01:00;P;;;;;;',
      CTX,
    );
    expect(record).toMatchObject({
      type: 'D',
      districtCode: '002',
      propertyId: '6069384',
      saleCounter: '1',
      ownerType: 'P',
    });
  });

  it('parses a Z trailer record', () => {
    const record = parseRecordLine('Z;7;1;1;3;', CTX);
    expect(record).toMatchObject({
      type: 'Z',
      totalLines: '7',
      bCount: '1',
      cCount: '1',
      dCount: '3',
    });
  });

  it('attaches provenance (sourceFile, lineNumber, rawLine) to every record', () => {
    const record = parseRecordLine('Z;7;1;1;3;', {
      sourceFile: 'x.dat',
      lineNumber: 42,
    });
    expect(record).toMatchObject({
      sourceFile: 'x.dat',
      lineNumber: 42,
      rawLine: 'Z;7;1;1;3;',
    });
  });

  it('rejects an unknown record type', () => {
    expect(() => parseRecordLine('X;foo;', CTX)).toThrow(
      PropertySalesIngestionException,
    );
    try {
      parseRecordLine('X;foo;', CTX);
      throw new Error('expected parseRecordLine to throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'PARSE_UNKNOWN_RECORD_TYPE' });
    }
  });

  it('rejects a record with the wrong field count', () => {
    try {
      parseRecordLine('B;001;2892712;', CTX);
      throw new Error('expected parseRecordLine to throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'PARSE_FIELD_COUNT_MISMATCH' });
    }
  });

  it('never produces a literal "B" in any mapped B-record field (the marker is dropped, not a data value)', () => {
    const line =
      'B;001;2892712;1;20260727 01:00;;;121;EGLINFORD LANE;CONGEWAI;2325;1.912;H;20260424;20260723;1065000;RU2;R;RESIDENCE;;RAH;;0;AW320686;';
    const record = parseRecordLine(line, CTX) as Record<string, unknown>;
    // Strip the discriminant and the provenance fields the parser adds, so only
    // values that came from the line itself are checked.
    const PROVENANCE = new Set(['type', 'sourceFile', 'lineNumber', 'rawLine']);
    const mappedValues = Object.entries(record)
      .filter(([key]) => !PROVENANCE.has(key))
      .map(([, value]) => value);
    expect(mappedValues).not.toContain('B');
  });
});

describe('saleKey', () => {
  it('joins districtCode, propertyId and saleCounter with "|"', () => {
    const record = parseRecordLine('C;001;6069384;3;20260727 01:00;desc;', {
      sourceFile: '001.dat',
      lineNumber: 1,
    }) as LegalDescriptionRecordRaw;
    expect(saleKey(record)).toBe('001|6069384|3');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// File-level parsing
// ─────────────────────────────────────────────────────────────────────────

describe('parseDatFile', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'psi-dat-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeDat(content: string): Promise<string> {
    const path = join(dir, 'sample.dat');
    await writeFile(path, content, 'latin1');
    return path;
  }

  // A trimmed but structurally faithful copy of the real archive's smallest
  // file (district 002): one sale, one legal description, three ownership rows.
  const VALID_FILE = [
    'A;RTSALEDATA;002;20260727 01:00;VALNET;',
    'B;002;6069384;1;20260727 01:00;;;15;DURHAM RD;EAST GRESFORD;2311;1846;M;20260310;20260421;275000;;V;VACANT LAND;;;;;AW50888;',
    'C;002;6069384;1;20260727 01:00;6/1106117;',
    'D;002;6069384;1;20260727 01:00;P;;;;;;',
    'D;002;6069384;1;20260727 01:00;V;;;;;;',
    'D;002;6069384;1;20260727 01:00;V;;;;;;',
    'Z;7;1;1;3;',
    '',
  ].join('\n');

  it('parses a well-formed file and reconciles the Z trailer', async () => {
    const path = await writeDat(VALID_FILE);
    const parsed = await parseDatFile(path, '002_SALES_DATA.DAT');

    expect(parsed.header).toMatchObject({ districtCode: '002' });
    expect(parsed.sales).toHaveLength(1);
    expect(parsed.legalDescriptions).toHaveLength(1);
    expect(parsed.ownerships).toHaveLength(3);
    expect(parsed.lineCount).toBe(7);
  });

  it('throws PARSE_MISSING_HEADER when the file does not start with A', async () => {
    const withoutHeader = VALID_FILE.split('\n').slice(1).join('\n');
    const path = await writeDat(withoutHeader);
    await expect(parseDatFile(path, 'bad.dat')).rejects.toMatchObject({
      code: 'PARSE_MISSING_HEADER',
    });
  });

  it('throws PARSE_MISSING_TRAILER when there is no Z record', async () => {
    const lines = VALID_FILE.split('\n');
    const withoutTrailer = lines.filter((l) => !l.startsWith('Z;')).join('\n');
    const path = await writeDat(withoutTrailer);
    await expect(parseDatFile(path, 'bad.dat')).rejects.toMatchObject({
      code: 'PARSE_MISSING_TRAILER',
    });
  });

  it('throws PARSE_TRAILER_MISMATCH when declared counts disagree with actual counts', async () => {
    const withWrongTrailer = VALID_FILE.replace('Z;7;1;1;3;', 'Z;7;1;1;2;');
    const path = await writeDat(withWrongTrailer);
    await expect(parseDatFile(path, 'bad.dat')).rejects.toMatchObject({
      code: 'PARSE_TRAILER_MISMATCH',
    });
  });

  it('throws PARSE_TRAILER_MISMATCH when totalLines is internally inconsistent', async () => {
    const withWrongTotal = VALID_FILE.replace('Z;7;1;1;3;', 'Z;99;1;1;3;');
    const path = await writeDat(withWrongTotal);
    await expect(parseDatFile(path, 'bad.dat')).rejects.toMatchObject({
      code: 'PARSE_TRAILER_MISMATCH',
    });
  });

  it('throws PARSE_TRAILER_MISMATCH on a second A header record', async () => {
    const lines = VALID_FILE.split('\n');
    lines.splice(1, 0, 'A;RTSALEDATA;002;20260727 01:00;VALNET;');
    const path = await writeDat(lines.join('\n'));
    await expect(parseDatFile(path, 'bad.dat')).rejects.toMatchObject({
      code: 'PARSE_TRAILER_MISMATCH',
    });
  });

  it('propagates an unknown record type from the record parser', async () => {
    const withGarbage = VALID_FILE.replace(
      'D;002;6069384;1;20260727 01:00;V;;;;;;',
      'X;garbage;',
    );
    const path = await writeDat(withGarbage);
    await expect(parseDatFile(path, 'bad.dat')).rejects.toMatchObject({
      code: 'PARSE_UNKNOWN_RECORD_TYPE',
    });
  });

  it('tolerates a trailing blank line without miscounting', async () => {
    const path = await writeDat(`${VALID_FILE}\n\n`);
    const parsed = await parseDatFile(path, '002.dat');
    expect(parsed.lineCount).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Coercion
// ─────────────────────────────────────────────────────────────────────────

describe('toNullableVarchar', () => {
  it('maps blank to null', () => {
    expect(toNullableVarchar('', 'field', 10)).toBeNull();
  });

  it('passes through a value within the length limit', () => {
    expect(toNullableVarchar('ABERMAIN', 'locality', 100)).toBe('ABERMAIN');
  });

  it('rejects a value over the length limit', () => {
    expect(() => toNullableVarchar('12345', 'district_code', 4)).toThrow(
      CoercionError,
    );
    try {
      toNullableVarchar('12345', 'district_code', 4);
    } catch (err) {
      expect(err).toBeInstanceOf(CoercionError);
      expect((err as CoercionError).rule).toBe('MAX_LENGTH_EXCEEDED');
      expect((err as CoercionError).field).toBe('district_code');
    }
  });
});

describe('toDateOrNull', () => {
  it('maps blank to null', () => {
    expect(toDateOrNull('', 'contract_date')).toBeNull();
  });

  it('parses a valid YYYYMMDD date', () => {
    expect(toDateOrNull('20260421', 'contract_date')).toBe('2026-04-21');
  });

  it('rejects a value that is not 8 digits', () => {
    expect(() => toDateOrNull('2026-04-21', 'contract_date')).toThrow(
      CoercionError,
    );
  });

  it('rejects an impossible calendar date', () => {
    expect(() => toDateOrNull('20260230', 'contract_date')).toThrow(
      CoercionError,
    );
  });

  it('rejects month 00 and day 00', () => {
    expect(() => toDateOrNull('20260000', 'contract_date')).toThrow(
      CoercionError,
    );
  });

  it('accepts a leap day in a leap year and rejects it otherwise', () => {
    expect(toDateOrNull('20240229', 'contract_date')).toBe('2024-02-29');
    expect(() => toDateOrNull('20250229', 'contract_date')).toThrow(
      CoercionError,
    );
  });
});

describe('toDownloadDatetimeOrNull', () => {
  it('maps blank to null', () => {
    expect(toDownloadDatetimeOrNull('', 'download_datetime')).toBeNull();
  });

  it('parses the real feed format', () => {
    expect(
      toDownloadDatetimeOrNull('20260727 01:00', 'download_datetime'),
    ).toBe('2026-07-27 01:00:00');
  });

  it('rejects a missing time part', () => {
    expect(() =>
      toDownloadDatetimeOrNull('20260727', 'download_datetime'),
    ).toThrow(CoercionError);
  });

  it('rejects an out-of-range hour or minute', () => {
    expect(() =>
      toDownloadDatetimeOrNull('20260727 24:00', 'download_datetime'),
    ).toThrow(CoercionError);
    expect(() =>
      toDownloadDatetimeOrNull('20260727 00:60', 'download_datetime'),
    ).toThrow(CoercionError);
  });

  it('rejects an invalid date part even with a valid time', () => {
    expect(() =>
      toDownloadDatetimeOrNull('20260230 01:00', 'download_datetime'),
    ).toThrow(CoercionError);
  });
});

describe('toIntegerOrNull', () => {
  it('maps blank to null', () => {
    expect(
      toIntegerOrNull('', 'sale_counter', { min: -32768, max: 32767 }),
    ).toBeNull();
  });

  it('parses a valid integer', () => {
    expect(
      toIntegerOrNull('115', 'sale_counter', { min: -32768, max: 32767 }),
    ).toBe(115);
  });

  it('rejects a non-integer value', () => {
    expect(() =>
      toIntegerOrNull('12.5', 'sale_counter', { min: 0, max: 100 }),
    ).toThrow(CoercionError);
    expect(() =>
      toIntegerOrNull('abc', 'sale_counter', { min: 0, max: 100 }),
    ).toThrow(CoercionError);
  });

  it('rejects a value outside the bounds', () => {
    expect(() =>
      toIntegerOrNull('40000', 'sale_counter', { min: -32768, max: 32767 }),
    ).toThrow(CoercionError);
  });
});

describe('toNumericOrNull', () => {
  it('maps blank to null', () => {
    expect(
      toNumericOrNull('', 'purchase_price', { precision: 15, scale: 2 }),
    ).toBeNull();
  });

  it('passes through a value within precision and scale', () => {
    expect(
      toNumericOrNull('275000', 'purchase_price', { precision: 15, scale: 2 }),
    ).toBe('275000');
    expect(toNumericOrNull('1.912', 'area', { precision: 15, scale: 4 })).toBe(
      '1.912',
    );
  });

  it('rejects a non-numeric value', () => {
    expect(() =>
      toNumericOrNull('12,000', 'purchase_price', { precision: 15, scale: 2 }),
    ).toThrow(CoercionError);
    try {
      toNumericOrNull('12,000', 'purchase_price', { precision: 15, scale: 2 });
      throw new Error('expected toNumericOrNull to throw');
    } catch (err) {
      expect(err).toMatchObject({
        rule: 'INVALID_NUMERIC',
        field: 'purchase_price',
        value: '12,000',
      });
    }
  });

  // The real feed writes sub-unit values without the leading zero — both of
  // these are real areas from the weekly archives (".6" m², ".98" ha).
  it('accepts a bare-leading decimal', () => {
    expect(toNumericOrNull('.6', 'area', { precision: 15, scale: 4 })).toBe(
      '.6',
    );
    expect(toNumericOrNull('.98', 'area', { precision: 15, scale: 4 })).toBe(
      '.98',
    );
    expect(
      toNumericOrNull('-.5', 'interest_of_sale_percent', {
        precision: 5,
        scale: 2,
      }),
    ).toBe('-.5');
  });

  it('still applies scale to a bare-leading decimal', () => {
    expect(() =>
      toNumericOrNull('.12345', 'area', { precision: 15, scale: 4 }),
    ).toThrow(CoercionError);
  });

  it('rejects a trailing decimal point', () => {
    expect(() =>
      toNumericOrNull('1.', 'area', { precision: 15, scale: 4 }),
    ).toThrow(CoercionError);
    expect(() =>
      toNumericOrNull('.', 'area', { precision: 15, scale: 4 }),
    ).toThrow(CoercionError);
  });

  it('rejects a value with too many decimal places', () => {
    expect(() =>
      toNumericOrNull('1.23456', 'area', { precision: 15, scale: 4 }),
    ).toThrow(CoercionError);
  });

  it('rejects a value with too many total significant digits', () => {
    expect(() =>
      toNumericOrNull('9999.99', 'interest_of_sale_percent', {
        precision: 5,
        scale: 2,
      }),
    ).toThrow(CoercionError);
  });

  it('accepts the boundary precision exactly', () => {
    expect(
      toNumericOrNull('999.99', 'purchase_price', { precision: 5, scale: 2 }),
    ).toBe('999.99');
  });

  it('does not count a leading zero as significant precision', () => {
    expect(
      toNumericOrNull('0.5', 'interest_of_sale_percent', {
        precision: 5,
        scale: 2,
      }),
    ).toBe('0.5');
  });
});

describe('toEnumOrNull', () => {
  it('maps blank to null', () => {
    expect(toEnumOrNull('', 'area_type', ['M', 'H'] as const)).toBeNull();
  });

  it('accepts an allowed value', () => {
    expect(toEnumOrNull('M', 'area_type', ['M', 'H'] as const)).toBe('M');
  });

  it('rejects a value outside the enum', () => {
    expect(() => toEnumOrNull('X', 'area_type', ['M', 'H'] as const)).toThrow(
      CoercionError,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Sale row mapping
// ─────────────────────────────────────────────────────────────────────────

describe('mapSaleRow', () => {
  const CTX = { sourceFile: '001.dat', lineNumber: 2 };

  function sale(line: string): SaleRecordRaw {
    return parseRecordLine(line, CTX) as SaleRecordRaw;
  }

  function ownership(ownerType: string): OwnershipRecordRaw {
    return parseRecordLine(
      `D;001;2892712;1;20260727 01:00;${ownerType};;;;;;`,
      CTX,
    ) as OwnershipRecordRaw;
  }

  const VALID_SALE_LINE =
    'B;001;2892712;1;20260727 01:00;;;121;EGLINFORD LANE;CONGEWAI;2325;1.912;H;20260424;20260723;1065000;RU2;R;RESIDENCE;;RAH;;;AW320686;';

  it('accepts a well-formed sale and coerces every field', () => {
    const outcome = mapSaleRow(sale(VALID_SALE_LINE), [
      ownership('P'),
      ownership('V'),
    ]);

    expect(outcome.rejections).toHaveLength(0);
    expect(outcome.row).toMatchObject({
      districtCode: '001',
      propertyId: '2892712',
      saleCounter: 1,
      downloadDatetime: '2026-07-27 01:00:00',
      propertyHouseNumber: '121',
      propertyStreetName: 'EGLINFORD LANE',
      propertyLocality: 'CONGEWAI',
      propertyPostCode: '2325',
      area: '1.912',
      areaType: 'H',
      contractDate: '2026-04-24',
      settlementDate: '2026-07-23',
      purchasePrice: '1065000',
      zoning: 'RU2',
      natureOfProperty: 'R',
      primaryPurpose: 'RESIDENCE',
      componentCode: 'RAH',
      dealingNumber: 'AW320686',
      ownerType: 'P,V',
    });
  });

  // Regression: two sales across the 31-archive corpus carry a bare-leading
  // decimal area (".6" m² and ".98" ha). The NUMERIC pattern used to require a
  // digit before the point, so both otherwise-valid rows were discarded whole.
  it('accepts a sale whose area is a bare-leading decimal', () => {
    const outcome = mapSaleRow(
      sale(VALID_SALE_LINE.replace(';1.912;H;', ';.6;M;')),
      [ownership('P')],
    );

    expect(outcome.rejections).toHaveLength(0);
    expect(outcome.row).toMatchObject({ area: '.6', areaType: 'M' });
  });

  it('maps every blank field to null rather than rejecting', () => {
    const blank = sale('B;;;;;;;;;;;;;;;;;;;;;;;;');
    const outcome = mapSaleRow(blank, []);
    expect(outcome.rejections).toHaveLength(0);
    expect(outcome.row).toMatchObject({
      districtCode: null,
      propertyId: null,
      saleCounter: null,
      dealingNumber: null,
      ownerType: null,
    });
  });

  it('rejects an invalid area_type and reports the offending field', () => {
    const withBadAreaType = sale(VALID_SALE_LINE.replace(';H;', ';X;'));
    const outcome = mapSaleRow(withBadAreaType, []);

    expect(outcome.row).toBeNull();
    expect(outcome.rejections).toEqual([
      expect.objectContaining({
        field: 'area_type',
        rule: 'ENUM_MISMATCH',
        value: 'X',
      }),
    ]);
  });

  it('rejects an impossible contract_date', () => {
    const withBadDate = sale(VALID_SALE_LINE.replace('20260424', '20260230'));
    const outcome = mapSaleRow(withBadDate, []);
    expect(outcome.row).toBeNull();
    expect(outcome.rejections).toEqual([
      expect.objectContaining({ field: 'contract_date', rule: 'INVALID_DATE' }),
    ]);
  });

  it('reports every failing field at once, not just the first', () => {
    const withTwoBadFields = sale(
      VALID_SALE_LINE.replace(';H;', ';X;').replace('20260424', '20260230'),
    );
    const outcome = mapSaleRow(withTwoBadFields, []);
    expect(outcome.row).toBeNull();
    expect(outcome.rejections).toHaveLength(2);
    const fields = outcome.rejections.map((r) => r.field).sort();
    expect(fields).toEqual(['area_type', 'contract_date']);
  });

  it('rejects a district_code over the 10-character schema limit', () => {
    const tooLong = sale(VALID_SALE_LINE.replace('B;001;', 'B;12345678901;'));
    const outcome = mapSaleRow(tooLong, []);
    expect(outcome.row).toBeNull();
    expect(outcome.rejections).toEqual([
      expect.objectContaining({
        field: 'district_code',
        rule: 'MAX_LENGTH_EXCEEDED',
      }),
    ]);
  });

  it('attaches sourceFile, lineNumber, rawLine and saleKey to every rejection', () => {
    const withBadAreaType = sale(VALID_SALE_LINE.replace(';H;', ';X;'));
    const outcome = mapSaleRow(withBadAreaType, []);
    expect(outcome.rejections[0]).toMatchObject({
      sourceFile: '001.dat',
      lineNumber: 2,
      recordType: 'B',
      saleKey: '001|2892712|1',
    });
  });
});

describe('deriveOwnerTypeRaw', () => {
  const CTX = { sourceFile: '001.dat', lineNumber: 2 };
  function ownership(ownerType: string): OwnershipRecordRaw {
    return parseRecordLine(
      `D;001;2892712;1;20260727 01:00;${ownerType};;;;;;`,
      CTX,
    ) as OwnershipRecordRaw;
  }

  it('returns an empty string when there are no ownership records', () => {
    expect(deriveOwnerTypeRaw([])).toBe('');
  });

  it('returns the sorted, comma-joined set of distinct owner types', () => {
    expect(
      deriveOwnerTypeRaw([ownership('V'), ownership('P'), ownership('V')]),
    ).toBe('P,V');
  });

  it('returns a single value when only one type is present', () => {
    expect(deriveOwnerTypeRaw([ownership('P'), ownership('P')])).toBe('P');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Content filter
// ─────────────────────────────────────────────────────────────────────────

describe('applySaleFilters', () => {
  function row(overrides: Partial<SaleRow> = {}): SaleRow {
    return {
      sourceFile: '001.dat',
      districtCode: '001',
      propertyId: '123',
      saleCounter: 1,
      downloadDatetime: '2026-08-03 01:00:00',
      propertyName: null,
      propertyUnitNumber: null,
      propertyHouseNumber: '4',
      propertyStreetName: 'MARKET FAIR RD',
      propertyLocality: 'NORTH ROTHBURY',
      propertyPostCode: '2335',
      area: '478.7',
      areaType: 'M',
      contractDate: '2025-10-21',
      settlementDate: '2026-07-24',
      purchasePrice: '385000',
      zoning: 'R2',
      natureOfProperty: 'V',
      primaryPurpose: 'VACANT LAND',
      strataLotNumber: null,
      componentCode: null,
      saleCode: null,
      interestOfSalePercent: null,
      dealingNumber: 'AW323794',
      ownerType: null,
      ...overrides,
    };
  }

  it('is a no-op when both exclusion sets are empty (the default)', () => {
    const rows = [row(), row({ saleCode: 'AE' }), row({ zoning: 'B' })];
    const result = applySaleFilters(rows, {
      excludedSaleCodes: new Set(),
      excludedZonings: new Set(),
    });
    expect(result.included).toBe(rows); // same reference: no filtering work done at all
    expect(result.excludedCount).toBe(0);
  });

  it('excludes rows whose sale_code is in the configured set', () => {
    const rows = [
      row({ saleCode: 'AC' }),
      row({ saleCode: 'B' }),
      row({ saleCode: null }),
    ];
    const result = applySaleFilters(rows, {
      excludedSaleCodes: new Set(['B']),
      excludedZonings: new Set(),
    });
    expect(result.included).toHaveLength(2);
    expect(result.excludedCount).toBe(1);
    expect(result.included.some((r) => r.saleCode === 'B')).toBe(false);
  });

  it('excludes rows whose zoning is in the configured set', () => {
    const rows = [row({ zoning: 'R2' }), row({ zoning: 'B' })];
    const result = applySaleFilters(rows, {
      excludedSaleCodes: new Set(),
      excludedZonings: new Set(['B']),
    });
    expect(result.included).toHaveLength(1);
    expect(result.excludedCount).toBe(1);
  });

  it('compares case-insensitively', () => {
    const rows = [row({ saleCode: 'b' })];
    const result = applySaleFilters(rows, {
      excludedSaleCodes: new Set(['B']),
      excludedZonings: new Set(),
    });
    expect(result.included).toHaveLength(0);
    expect(result.excludedCount).toBe(1);
  });

  it('treats a null field as an empty string for matching, never excluding it unless "" is configured', () => {
    const rows = [row({ saleCode: null })];
    const result = applySaleFilters(rows, {
      excludedSaleCodes: new Set(['B']),
      excludedZonings: new Set(),
    });
    expect(result.included).toHaveLength(1);
    expect(result.excludedCount).toBe(0);
  });

  it('applies both filters together (a row excluded by either is dropped)', () => {
    const rows = [
      row({ saleCode: 'B', zoning: 'R2' }),
      row({ saleCode: 'AC', zoning: 'B' }),
      row({ saleCode: 'AC', zoning: 'R2' }),
    ];
    const result = applySaleFilters(rows, {
      excludedSaleCodes: new Set(['B']),
      excludedZonings: new Set(['B']),
    });
    expect(result.included).toHaveLength(1);
    expect(result.excludedCount).toBe(2);
  });
});
