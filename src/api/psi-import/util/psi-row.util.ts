import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import {
  AreaType,
  PropertySalesRaw,
} from '../entities/property-sales-raw.entity';
import { PsiSaleRecord } from '../types/psi-sale-record.interface';

/**
 * Renders a parsed timestamp as the `YYYY-MM-DD` literal a `date` column expects.
 *
 * Reading in UTC is what makes this correct: `parseDatTimestamp` builds these with `Date.UTC`, so
 * the UTC calendar date is the date the .DAT file actually wrote. A local-zone render would roll
 * any stamp at or past 14:00 UTC onto the next day.
 *
 * A bare date literal also carries no timezone of its own, so it lands identically whether the
 * column is `date` or `timestamptz` under a UTC session — which is what QA and this container both
 * run. Verified against a `date` column: `2026-03-20T00:00:00.000Z` stores as `2026-03-20`.
 */
export function toDateOnly(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

/**
 * Narrows the raw `area_type` field to the `area_type_enum` values the column accepts.
 *
 * Anything else becomes null rather than being passed through. This is not defensive tidying: an
 * invalid enum label fails at *bind* time, which aborts the entire 500-row chunk — and therefore
 * the whole week's transaction — before a single row is inserted. Callers count the rejects so an
 * unexpected value shows up as a number rather than as a failed week.
 */
export function toAreaType(value: string | null): AreaType | null {
  return value === AreaType.SQUARE_METRES || value === AreaType.HECTARES
    ? value
    : null;
}

/** True when the source carried an `area_type` that `toAreaType` could not map. */
export function isUnmappedAreaType(value: string | null): boolean {
  return value !== null && toAreaType(value) === null;
}

/**
 * Translates a parsed `B` record onto the `PropertySalesRaw` entity.
 *
 * The parser deliberately keeps the .DAT file's own snake_case field names — `SALE_RECORD_FIELDS`
 * is the positional layout from the published VG spec, and renaming it would make it less faithful
 * to the format it exists to describe. The camelCase persistence model lives here instead, so the
 * two can drift independently.
 *
 * A misspelled *target* key is caught at compile time — `QueryDeepPartialEntity` triggers
 * excess-property checking on this object literal. What nothing catches is a key wired to the wrong
 * *source* field: both sides type-check, TypeORM writes the value happily, and the column simply
 * holds the wrong data. Read the pairs below against `SALE_RECORD_FIELDS` when changing them.
 *
 * `importedAt` is supplied rather than left to `@CreateDateColumn`, so every row from one week
 * shares a stamp. Verified in typeorm@0.3.28: `InsertQueryBuilder` has its `isCreateDate` branch
 * commented out, so an explicit value is written as given.
 */
export function toPropertySalesRow(
  record: PsiSaleRecord,
  importedAt: Date,
): QueryDeepPartialEntity<PropertySalesRaw> {
  return {
    // The cast leans on a guarantee that lives in another file: `toSaleRecord` sets `source_file`
    // unconditionally, and `PsiSaleRecord` types it nullable only because its siblings are. If that
    // ever stopped holding, the `NOT NULL` column rejects the row loudly rather than storing a
    // silent gap — so the cast defers the check to the database rather than removing it.
    sourceFile: record.source_file as string,
    importedAt,

    districtCode: record.district_code,
    propertyId: record.property_id,
    saleCounter: record.sale_counter,
    downloadDatetime: record.download_datetime,

    propertyName: record.property_name,
    propertyUnitNumber: record.property_unit_number,
    propertyHouseNumber: record.property_house_number,
    propertyStreetName: record.property_street_name,
    propertyLocality: record.property_locality,
    propertyPostCode: record.property_post_code,

    area: record.area,
    areaType: toAreaType(record.area_type),

    contractDate: toDateOnly(record.contract_date),
    settlementDate: toDateOnly(record.settlement_date),
    purchasePrice: record.purchase_price,

    zoning: record.zoning,
    natureOfProperty: record.nature_of_property,
    primaryPurpose: record.primary_purpose,

    strataLotNumber: record.strata_lot_number,
    componentCode: record.component_code,
    saleCode: record.sale_code,
    interestOfSalePercent: record.interest_of_sale_percent,
    dealingNumber: record.dealing_number,
    ownerType: record.owner_type,
  };
}
