import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PropertySalesConfig } from './property-sales.config';
import { PropertySalesService } from './property-sales.service';

@Injectable()
export class PropertySalesTask {
  private readonly logger = new Logger(PropertySalesTask.name);

  constructor(
    private readonly config: PropertySalesConfig,
    private readonly propertySales: PropertySalesService,
  ) {}

  @Cron('0 3 * * 1', {
    name: 'property-sales-ingest',
    waitForCompletion: true,
  })
  async handleWeeklySweep(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.log('[PSI] Disabled (PSI_DOWNLOAD_ENABLED=false) — skipping');
      return;
    }

    try {
      await this.runScheduledSweep();
    } catch (err) {
      this.logger.error(
        `[PSI] Unhandled error — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async runScheduledSweep(): Promise<void> {
    const result = await this.propertySales.run();
    this.logger.log(
      `[PSI] Sweep finished — status=${result.status}` +
        (result.consideredCount !== undefined
          ? ` considered=${result.consideredCount}`
          : ''),
    );
  }
}
