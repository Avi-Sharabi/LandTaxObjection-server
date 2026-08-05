import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PropertySalesService } from './property-sales.service';

@Injectable()
export class PropertySalesTask {
  private readonly logger = new Logger(PropertySalesTask.name);

  constructor(private readonly propertySales: PropertySalesService) {}

  @Cron('0 3 * * 1', {
    name: 'property-sales-ingest',
    waitForCompletion: true,
  })
  async handleWeeklyArchiveSync(): Promise<void> {
    try {
      await this.runScheduledArchiveSync();
    } catch (err) {
      this.logger.error(
        `[PSI] Unhandled error — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async runScheduledArchiveSync(): Promise<void> {
    const result = await this.propertySales.run();
    this.logger.log(
      `[PSI] Archive sync finished — status=${result.status}` +
        (result.consideredCount !== undefined
          ? ` considered=${result.consideredCount}`
          : ''),
    );
  }
}
