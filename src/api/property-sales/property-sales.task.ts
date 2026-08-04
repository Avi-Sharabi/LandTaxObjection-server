import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { PropertySalesConfig } from './property-sales.config';
import { PropertySalesService } from './property-sales.service';

/**
 * The cron trigger box: schedules one ingestion sweep per tick. Follows this
 * repo's dominant pattern (`SchedulerRegistry` + a dynamically built
 * `CronJob`, as in `HardDeleteCleanupTask`) rather than a static `@Cron(...)`
 * decorator, so the schedule stays env-driven and so registering the job at
 * all can be skipped outright while the feature is disabled.
 *
 * Calls `PropertySalesService.run()` directly — no queue. A weekly job that
 * takes a few minutes does not need BullMQ; the service's own in-process
 * `isRunning` flag is what stops two ticks overlapping under a short testing
 * interval.
 */
@Injectable()
export class PropertySalesTask implements OnModuleInit {
  private readonly logger = new Logger(PropertySalesTask.name);

  constructor(
    private readonly config: PropertySalesConfig,
    private readonly propertySales: PropertySalesService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log(
        '[PSI] Disabled (PSI_DOWNLOAD_ENABLED=false) — cron not scheduled',
      );
      return;
    }

    const job = new CronJob(this.config.cronSchedule, () => {
      this.runScheduledSweep().catch((err) =>
        this.logger.error(
          `[PSI] Unhandled error — ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    });
    this.schedulerRegistry.addCronJob('property-sales-ingest', job);
    job.start();
    this.logger.log(`[PSI] Scheduled with cron: "${this.config.cronSchedule}"`);
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
