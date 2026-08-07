import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PropertySalesRaw } from './entities/property-sales-raw.entity';

@Injectable()
export class PsiImportRepository {
  constructor(
    @InjectRepository(PropertySalesRaw)
    private readonly repo: Repository<PropertySalesRaw>,
  ) {}

  /**
   * Reads the most recent `download_datetime` already present in `property_sales_raw`.
   * This is the reference point the scraper compares weekly links against.
   *
   * `NULLS LAST` is not optional: Postgres sorts NULLs first under `ORDER BY ... DESC`, so a
   * single null row would otherwise come back as "the latest".
   *
   * Returns null only when the table is empty.
   */
  async findLatestDownloadDatetime(): Promise<Date | null> {
    const row = await this.repo.findOne({
      select: { download_datetime: true },
      where: {},
      order: { download_datetime: { direction: 'DESC', nulls: 'LAST' } },
    });

    return row?.download_datetime ?? null;
  }
}
