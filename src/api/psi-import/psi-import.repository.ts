import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PropertySalesRaw } from './entities/property-sales-raw.entity';
import { PSI_INSERT_CHUNK_SIZE } from './psi-import.constant';
import {
  PsiInsertOutcome,
  PsiSaleRecord,
} from './types/psi-sale-record.interface';
import { isUnmappedAreaType, toPropertySalesRow } from './util/psi-row.util';

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
      select: { downloadDatetime: true },
      where: {},
      order: { downloadDatetime: { direction: 'DESC', nulls: 'LAST' } },
    });

    return row?.downloadDatetime ?? null;
  }

  /**
   * Inserts one .DAT file's records through the caller's transaction-bound repository, skipping
   * whatever `uq_psr_dealing_number` rejects.
   *
   * **This deliberately loses rows.** The VG feed publishes one row per lot and several lots per
   * dealing, while QA and production constrain `dealing_number` to be unique. Rather than change
   * their schema, the import discards the surplus — permanently, since a week is never re-offered
   * once the watermark passes it. `suppressed` is returned so the loss is counted rather than
   * silent; a non-zero figure every week is expected, not a defect.
   *
   * The headline ~2.5% understates the shape of it: the loss is **concentrated, not spread**. A
   * two-lot residential sale loses one row; AW174310 in the 03 Aug 2026 bundle — a single
   * $11,600,820 commercial sale recorded as 28 property rows across 12 suburbs — loses 27. So the
   * rows that disappear are drawn disproportionately from large multi-lot and subdivided parcels,
   * which is the sale category comparables are already hardest to find. Nothing here records
   * *which* localities lost a row; if that matters, it needs adding deliberately.
   *
   * The repository is a parameter rather than this class's own `this.repo` because a TypeORM
   * transaction lives on one pooled connection, and a repository carries whichever manager built
   * it — `getRepository` constructs `new Repository(target, manager, queryRunner)`. `this.repo`
   * comes from the default manager, which owns no connection, so writing through it would commit
   * independently: a week that failed partway would leave its earlier files durable and advance
   * `MAX(download_datetime)` past the ones that never landed. `findLatestDownloadDatetime` uses
   * `this.repo` on purpose — a read has nothing to be atomic with.
   *
   * Batched here rather than by the ORM: `InsertQueryBuilder` emits one statement for whatever
   * array it is handed, so a slice loop is what keeps each statement under Postgres' 65535
   * bind-parameter cap (500 rows × 26 columns ≈ 13,000). Verified that `ON CONFLICT DO NOTHING`
   * also resolves duplicates *within* a single statement — unlike `DO UPDATE`, which raises
   * "cannot affect row a second time" — so a dealing repeated inside one file is handled too.
   *
   * `importedAt` is supplied rather than left to `@CreateDateColumn`, so one week's rows share a
   * stamp; see `toPropertySalesRow`.
   */
  async insertSaleRecords(
    txRepo: Repository<PropertySalesRaw>,
    records: PsiSaleRecord[],
    importedAt: Date,
  ): Promise<PsiInsertOutcome> {
    let inserted = 0;
    let suppressed = 0;
    let unmappedAreaType = 0;

    for (
      let offset = 0;
      offset < records.length;
      offset += PSI_INSERT_CHUNK_SIZE
    ) {
      const chunk = records.slice(offset, offset + PSI_INSERT_CHUNK_SIZE);

      unmappedAreaType += chunk.filter((record) =>
        isUnmappedAreaType(record.area_type),
      ).length;

      const result = await txRepo
        .createQueryBuilder()
        .insert()
        .values(chunk.map((record) => toPropertySalesRow(record, importedAt)))
        .orIgnore()
        // Explicit, though `updateEntity: true` would add it by default: the row count below
        // decides whether the week fails, so the clause it depends on is stated here rather than
        // left to a library default a reader would have to go and confirm.
        .returning('id')
        .execute();

      // Postgres returns one row per row it actually wrote, so the shortfall is what ON CONFLICT
      // discarded. Do NOT reach for `result.identifiers` or `generatedMaps` instead: TypeORM zips
      // those positionally against the values array, and once any row is skipped the alignment is
      // wrong. They are unused here for exactly that reason.
      const landed = Array.isArray(result.raw) ? result.raw.length : 0;
      inserted += landed;
      suppressed += chunk.length - landed;
    }

    return { inserted, suppressed, unmappedAreaType };
  }
}
