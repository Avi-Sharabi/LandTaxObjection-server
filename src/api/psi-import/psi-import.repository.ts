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
   * The manager is a parameter rather than this class's own repository because a TypeORM
   * transaction lives on one pooled connection, and `this.repo` is bound to the default manager,
   * which owns none. Writing through it would take a second connection and commit independently,
   * so a week that failed partway would leave its earlier files durable and advance
   * `MAX(download_datetime)` past the ones that never landed. `findLatestDownloadDatetime` uses
   * `this.repo` on purpose — a read has nothing to be atomic with.
   *
   * `chunk` keeps each statement under Postgres' 65535 bind-parameter cap. The records carry no
   * `id`, so `save` always inserts and never looks up an existing row to decide.
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
    await manager.save(
      PropertySalesRaw,
      records.map((record) => ({ ...record, imported_at: importedAt })),
      { chunk: PSI_INSERT_CHUNK_SIZE },
    );
  }
}
