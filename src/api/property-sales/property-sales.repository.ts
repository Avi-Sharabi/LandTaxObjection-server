import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { PropertySalesArchive } from './entities/property-sales-archive.entity';

@Injectable()
export class PropertySalesRepository {
  constructor(
    @InjectRepository(PropertySalesArchive)
    private readonly archiveRepo: Repository<PropertySalesArchive>,
  ) {}

  /**
   * Release dates whose archive has already made it all the way into
   * property_sales_raw (status = 'loaded', set by KAN-242's future load
   * step). Unlike the earlier property_sales_raw-scanning approach,
   * property_sales_archives is migration-owned by this repo (see
   * 1785715200000-CreatePropertySalesArchives), so no existence-check guard
   * is needed here — TypeORM already knows this table exists.
   *
   * KNOWN GAP: this is the only method that touches PropertySalesArchive,
   * and it's read-only — nothing anywhere in this codebase ever writes a row
   * to this table. So this always returns an empty set today, and every
   * archive sync re-attempts the same oldest backlog candidates with no
   * memory of past runs (see selectArchivesToIngest's doc comment). Fixing
   * this means writing status transitions during the sync AND deciding what
   * "already handled by this ticket" should mean — probably not literally
   * 'loaded', which is specifically KAN-242's terminal state, not KAN-241's.
   * Deliberately deferred, not fixed here.
   */
  async readLoadedReleaseDates(): Promise<ReadonlySet<string>> {
    const rows = await this.archiveRepo.find({
      select: { release_date: true },
      where: { status: 'loaded' },
    });
    return new Set(rows.map((row) => row.release_date));
  }
}
