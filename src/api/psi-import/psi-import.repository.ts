import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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
   * Inserts one .DAT file's records through the caller's transaction-bound repository.
   *
   * The repository is a parameter rather than this class's own `this.repo` because a TypeORM
   * transaction lives on one pooled connection, and a repository carries whichever manager built
   * it — `getRepository` constructs `new Repository(target, manager, queryRunner)`. `this.repo`
   * comes from the default manager, which owns no connection, so writing through it would commit
   * independently: a week that failed partway would leave its earlier files durable and advance
   * `MAX(download_datetime)` past the ones that never landed. `findLatestDownloadDatetime` uses
   * `this.repo` on purpose — a read has nothing to be atomic with.
   *
   * Batched here rather than by the ORM: `insert` has no `chunk` option — `InsertQueryBuilder`
   * emits one statement for whatever array it is handed — so a slice loop is what keeps each
   * statement under Postgres' 65535 bind-parameter cap (500 rows × 26 columns ≈ 13,000).
   *
   * `imported_at` is stamped here rather than left to a column default. The table was created
   * out-of-band, so this repo cannot see whether it has one, and
   * `comparables.service.ts` copies the value onto `comparable_sales` — a NULL would propagate.
   */
  async insertSaleRecords(
    txRepo: Repository<PropertySalesRaw>,
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

      await txRepo.insert(chunk);
    }
  }
}
