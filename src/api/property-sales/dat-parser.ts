import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import { DatParsingException } from './exceptions/dat-parsing.exception';
import type { PropertySalesConfig } from './property-sales.config';

const B_FIELDS = [
  'districtCode',
  'propertyId',
  'saleCounter',
  'downloadDateTime',
  'propertyName',
  'propertyUnitNumber',
  'propertyHouseNumber',
  'propertyStreetName',
  'propertyLocality',
  'propertyPostCode',
  'area',
  'areaType',
  'contractDate',
  'settlementDate',
  'purchasePrice',
  'zoning',
  'natureOfProperty',
  'primaryPurpose',
  'strataLotNumber',
  'componentCode',
  'saleCode',
  'interestOfSalePercent',
  'dealingNumber',
] as const;
const B_FIELD_COUNT = B_FIELDS.length + 1;

type SaleField = (typeof B_FIELDS)[number];
type AreaType = 'M' | 'H';

interface RawSale extends Record<SaleField, string> {
  readonly sourceFile: string;
}

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
}

interface ParsedSales {
  readonly rows: readonly SaleRow[];
  readonly rejectedCount: number;
}

interface SaleFilterResult {
  readonly included: readonly SaleRow[];
  readonly excludedCount: number;
}

class InvalidFieldError extends Error {}

function text(value: string, maxLength: number): string | null {
  if (value === '') return null;
  if (value.length > maxLength) {
    throw new InvalidFieldError();
  }
  return value;
}

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isoDate(value: string): string | null {
  if (value === '') return null;
  if (!/^\d{8}$/.test(value)) throw new InvalidFieldError();

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  if (!isValidDate(year, month, day)) throw new InvalidFieldError();

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function isoDateTime(value: string): string | null {
  if (value === '') return null;
  const match = /^(\d{8})\s+(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new InvalidFieldError();

  const [, date, hour, minute] = match;
  if (Number(hour) > 23 || Number(minute) > 59) throw new InvalidFieldError();

  return `${isoDate(date)} ${hour}:${minute}:00`;
}

function integer(
  value: string,
  bounds: { min: number; max: number },
): number | null {
  if (value === '') return null;
  if (!/^-?\d+$/.test(value)) throw new InvalidFieldError();

  const parsed = Number(value);
  if (parsed < bounds.min || parsed > bounds.max) throw new InvalidFieldError();
  return parsed;
}

function decimal(
  value: string,
  limits: { precision: number; scale: number },
): string | null {
  if (value === '') return null;
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) {
    throw new InvalidFieldError();
  }

  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  const [whole = '', fraction = ''] = unsigned.split('.');
  const wholeDigits =
    whole === '' ? 0 : whole.replace(/^0+(?=\d)/, '').length || 1;

  if (
    fraction.length > limits.scale ||
    wholeDigits + fraction.length > limits.precision
  ) {
    throw new InvalidFieldError();
  }
  return value;
}

function areaType(value: string): AreaType | null {
  if (value === '') return null;
  if (value !== 'M' && value !== 'H') throw new InvalidFieldError();
  return value;
}

function parseBRecord(
  line: string,
  sourceFile: string,
  lineNumber: number,
): RawSale | null {
  if (!line.startsWith('B;')) return null;

  const parts = line.split(';');
  if (parts.at(-1) === '') parts.pop();

  if (parts.length !== B_FIELD_COUNT) {
    throw new DatParsingException(
      `B record in ${sourceFile}:${lineNumber} has ${parts.length} fields, expected ${B_FIELD_COUNT}`,
      {
        context: {
          sourceFile,
          lineNumber,
          expected: B_FIELD_COUNT,
          actual: parts.length,
        },
      },
    );
  }

  const fields = {} as Record<SaleField, string>;
  B_FIELDS.forEach((field, index) => {
    fields[field] = (parts[index + 1] ?? '').trim();
  });

  return { ...fields, sourceFile };
}

function mapSale(sale: RawSale): SaleRow | null {
  try {
    const sourceFile = text(sale.sourceFile, 255);
    if (sourceFile === null) throw new InvalidFieldError();

    return {
      sourceFile,
      districtCode: text(sale.districtCode, 10),
      propertyId: text(sale.propertyId, 50),
      saleCounter: integer(sale.saleCounter, { min: -32768, max: 32767 }),
      downloadDatetime: isoDateTime(sale.downloadDateTime),
      propertyName: text(sale.propertyName, 255),
      propertyUnitNumber: text(sale.propertyUnitNumber, 50),
      propertyHouseNumber: text(sale.propertyHouseNumber, 50),
      propertyStreetName: text(sale.propertyStreetName, 255),
      propertyLocality: text(sale.propertyLocality, 100),
      propertyPostCode: text(sale.propertyPostCode, 4),
      area: decimal(sale.area, { precision: 15, scale: 4 }),
      areaType: areaType(sale.areaType),
      contractDate: isoDate(sale.contractDate),
      settlementDate: isoDate(sale.settlementDate),
      purchasePrice: decimal(sale.purchasePrice, {
        precision: 15,
        scale: 2,
      }),
      zoning: text(sale.zoning, 20),
      natureOfProperty: text(sale.natureOfProperty, 50),
      primaryPurpose: text(sale.primaryPurpose, 50),
      strataLotNumber: text(sale.strataLotNumber, 50),
      componentCode: text(sale.componentCode, 20),
      saleCode: text(sale.saleCode, 20),
      interestOfSalePercent: decimal(sale.interestOfSalePercent, {
        precision: 5,
        scale: 2,
      }),
      dealingNumber: text(sale.dealingNumber, 50),
    };
  } catch (error) {
    if (error instanceof InvalidFieldError) return null;
    throw error;
  }
}

export async function parseDatFile(
  absolutePath: string,
  sourceFile: string,
): Promise<ParsedSales> {
  const lines = createInterface({
    input: createReadStream(absolutePath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  const rows: SaleRow[] = [];
  let rejectedCount = 0;
  let lineNumber = 0;

  for await (const line of lines) {
    lineNumber += 1;
    const sale = parseBRecord(line, sourceFile, lineNumber);
    if (sale === null) continue;

    const row = mapSale(sale);
    if (row === null) rejectedCount += 1;
    else rows.push(row);
  }

  return { rows, rejectedCount };
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
