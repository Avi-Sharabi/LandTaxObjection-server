import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { PropertySalesConfig } from './property-sales.config';
import { PropertySalesRetentionService } from './property-sales-retention.service';

@Injectable()
export class PropertySalesRetentionTask implements OnModuleInit {
  private readonly logger = new Logger(PropertySalesRetentionTask.name);

  constructor(
    private readonly config: PropertySalesConfig,
    private readonly retentionService: PropertySalesRetentionService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log('[PSI-RETENTION] Disabled (PSI_DOWNLOAD_ENABLED=false) — cron not scheduled');
      return;
    }

    const job = new CronJob(this.config.retentionCronSchedule, () => {
      this.runRetention().catch((err) =>
        this.logger.error(`[PSI-RETENTION] Unhandled error — ${err instanceof Error ? err.message : String(err)}`),
      );
    });
    this.schedulerRegistry.addCronJob('property-sales-retention', job);
    job.start();
    this.logger.log(
      `[PSI-RETENTION] Scheduled with cron: "${this.config.retentionCronSchedule}" (dryRun=${this.config.retentionDryRun})`,
    );
  }

  /** Runs inline — unlike downloads, retention never launches a browser, so no queue/worker is needed. */
  async runRetention(): Promise<void> {
    const result = await this.retentionService.runRetention();
    this.logger.log(
      `[PSI-RETENTION] Complete — dryRun=${result.dryRun} ` +
        `retired=${result.retiredArchives.deletedCount}/${result.retiredArchives.candidates.length} ` +
        `agedUnloaded=${result.agedUnloadedArchives.deletedCount}/${result.agedUnloadedArchives.candidates.length} ` +
        `orphanedStaging=${result.orphanedStaging.deletedCount}/${result.orphanedStaging.candidates.length}`,
    );
  }
}
