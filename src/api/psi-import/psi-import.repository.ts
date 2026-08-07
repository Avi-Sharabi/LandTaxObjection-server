import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { PropertySalesRaw } from './entities/property-sales-raw.entity';
import { PSI_INSERT_CHUNK_SIZE } from './psi-import.constant';
import { PsiSaleRecord } from './types/psi-sale-record.interface';

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

  /**
   * Inserts one .DAT file's records through the caller's `EntityManager`.
   *
   * The manager is a parameter rather than this class's own repository so the write joins the
   * week-level transaction the service owns, instead of committing on its own. See
   * `PsiImportService.ingestWeek` for why a week has to be all-or-nothing.
   *
   * `insert` rather than `save`: `save` issues a SELECT per row to decide insert-vs-update, which
   * across a week's ~3,200 records is that many needless round trips — and `property_sales_raw`
   * has no unique key for it to match on anyway.
   *
   * `imported_at` is stamped here rather than left to a column default. The table was created
   * out-of-band, so this repo cannot see whether it has one, and
   * `comparables.service.ts` copies the value onto `comparable_sales` — a NULL would propagate.
   */
  async insertSaleRecords(
    manager: EntityManager,
    records: PsiSaleRecord[],
    importedAt: Date,
  ): Promise<void> {
    for (
      let offset = 0;
      offset < records.length;
      offset += PSI_INSERT_CHUNK_SIZE
    ) {
      const chunk = records
        .slice(offset, offset + PSI_INSERT_CHUNK_SIZE)
        .map((record) => ({ ...record, imported_at: importedAt }));

      await manager.insert(PropertySalesRaw, chunk);
    }
  }
}
