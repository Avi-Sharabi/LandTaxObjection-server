import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ComparableSale } from './comparable-sales.interface';

export interface SearchParams {
  locality: string;
  street: string;
  houseNumber?: string;
  /** undefined = no strata filter (mixed tenure) */
  isStrata?: boolean;
  dateThreshold: Date;
  subjectArea?: number;
  limit: number;
  additionalLocalities?: string[];
}

@Injectable()
export class ComparableSalesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async search(params: SearchParams): Promise<ComparableSale[]> {
    const { sql, queryParams } = this.buildQuery(params);
    return this.dataSource.query(sql, queryParams);
  }

  async executeRawSql(sql: string, params: unknown[]): Promise<ComparableSale[]> {
    return this.dataSource.query(sql, params);
  }

  async lookupArea(
    locality: string,
    street: string,
    houseNumber?: string,
    unitNumber?: string,
  ): Promise<number | null> {
    const qParams: unknown[] = [locality, street];
    const where: string[] = ['property_locality = $1', 'property_street_name = $2', 'area > 0'];

    if (houseNumber) {
      qParams.push(houseNumber);
      where.push(`property_house_number = $${qParams.length}`);
    }

    if (unitNumber) {
      qParams.push(unitNumber);
      where.push(`property_unit_number = $${qParams.length}`);
    }

    const rows: Array<{ area: number }> = await this.dataSource.query(
      `SELECT area FROM property_sales_raw WHERE ${where.join(' AND ')} ORDER BY contract_date DESC LIMIT 1`,
      qParams,
    );

    return rows[0]?.area ?? null;
  }

  async findStreetName(locality: string, street: string): Promise<string | null> {
    const sanitized = street.toUpperCase().trim();
    const rows: Array<{ property_street_name: string }> = await this.dataSource.query(
      `SELECT DISTINCT property_street_name
       FROM property_sales_raw
       WHERE property_locality = $1
         AND property_street_name LIKE $2
       LIMIT 1`,
      [locality, `%${sanitized}%`],
    );
    return rows[0]?.property_street_name ?? null;
  }

  async findAdjacentLocalities(locality: string): Promise<string[]> {
    const rows: Array<{ property_locality: string }> = await this.dataSource.query(
      `SELECT DISTINCT property_locality
       FROM property_sales_raw
       WHERE property_post_code = (
         SELECT property_post_code
         FROM property_sales_raw
         WHERE property_locality = $1
           AND property_post_code IS NOT NULL
         LIMIT 1
       )
         AND property_locality != $1
         AND property_locality IS NOT NULL
       LIMIT 5`,
      [locality],
    );
    return rows.map((r) => r.property_locality);
  }

  private buildQuery(p: SearchParams): { sql: string; queryParams: unknown[] } {
    const queryParams: unknown[] = [];
    const add = (val: unknown): string => {
      queryParams.push(val);
      return `$${queryParams.length}`;
    };

    const where: string[] = [];

    if (p.additionalLocalities?.length) {
      where.push(`property_locality = ANY(${add([p.locality, ...p.additionalLocalities])})`);
    } else {
      where.push(`property_locality = ${add(p.locality)}`);
    }

    where.push(`property_street_name = ${add(p.street)}`);

    if (p.houseNumber !== undefined) {
      where.push(`property_house_number = ${add(p.houseNumber)}`);
    }

    if (p.isStrata === true) {
      where.push(`strata_lot_number IS NOT NULL`);
    } else if (p.isStrata === false) {
      where.push(`strata_lot_number IS NULL`);
    }

    // Date threshold is calculated server-side; never derived from raw user input
    where.push(`contract_date >= ${add(p.dateThreshold.toISOString().split('T')[0])}::date`);
    where.push(`(sale_code NOT IN ('N', 'V') OR sale_code IS NULL)`);
    where.push(`(interest_of_sale_percent = 0.00 OR interest_of_sale_percent IS NULL)`);
    where.push(`purchase_price > 0`);
    where.push(`area > 0`);

    const areaDiffExpr =
      p.subjectArea !== undefined
        ? `ABS(area - ${add(p.subjectArea)}) AS "areaDifference"`
        : `NULL::numeric AS "areaDifference"`;

    const limitClause = add(p.limit);

    const sql = `
      SELECT
        id,
        source_file               AS "sourceFile",
        imported_at               AS "importedAt",
        district_code             AS "districtCode",
        property_id               AS "propertyId",
        sale_counter              AS "saleCounter",
        download_datetime         AS "downloadDatetime",
        property_name             AS "propertyName",
        property_unit_number      AS "propertyUnitNumber",
        property_house_number     AS "propertyHouseNumber",
        property_street_name      AS "propertyStreetName",
        property_locality         AS "propertyLocality",
        property_post_code        AS "propertyPostCode",
        area,
        contract_date             AS "contractDate",
        settlement_date           AS "settlementDate",
        purchase_price            AS "purchasePrice",
        zoning,
        nature_of_property        AS "natureOfProperty",
        primary_purpose           AS "primaryPurpose",
        strata_lot_number         AS "strataLotNumber",
        component_code            AS "componentCode",
        sale_code                 AS "saleCode",
        interest_of_sale_percent  AS "interestOfSalePercent",
        dealing_number            AS "dealingNumber",
        owner_type                AS "ownerType",
        ROUND(purchase_price / NULLIF(area, 0), 2) AS "grossRatePerM2",
        ${areaDiffExpr}
      FROM property_sales_raw
      WHERE ${where.join('\n        AND ')}
      ORDER BY "areaDifference" ASC NULLS LAST, contract_date DESC
      LIMIT ${limitClause}
    `;

    return { sql, queryParams };
  }
}
