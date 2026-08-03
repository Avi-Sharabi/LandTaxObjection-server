import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { PropertySalesConfig } from './property-sales.config';
import { PropertySalesQueueService } from './property-sales-queue.service';

@Injectable()
export class PropertySalesDownloadTask implements OnModuleInit {
  private readonly logger = new Logger(PropertySalesDownloadTask.name);

  constructor(
    private readonly config: PropertySalesConfig,
    private readonly queueService: PropertySalesQueueService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log('[PSI-DOWNLOAD] Disabled (PSI_DOWNLOAD_ENABLED=false) — cron not scheduled');
      return;
    }

    const job = new CronJob(this.config.downloadCronSchedule, () => {
      this.runScheduledSweep().catch((err) =>
        this.logger.error(`[PSI-DOWNLOAD] Unhandled error — ${err instanceof Error ? err.message : String(err)}`),
      );
    });
    this.schedulerRegistry.addCronJob('property-sales-download', job);
    job.start();
    this.logger.log(`[PSI-DOWNLOAD] Scheduled with cron: "${this.config.downloadCronSchedule}"`);
  }

  /**
   * Only enqueues — the tick itself never runs the sweep inline. A
   * ConflictException (a sweep is already active/waiting under this same
   * `sweep` jobId) is expected, ordinary behaviour under a short testing
   * interval and is logged, not raised.
   */
  async runScheduledSweep(): Promise<void> {
    try {
      const result = await this.queueService.enqueueScheduledSweep();
      this.logger.log(`[PSI-DOWNLOAD] Enqueued scheduled sweep — jobId=${result.jobId}`);
    } catch (err) {
      if (err instanceof ConflictException) {
        this.logger.log('[PSI-DOWNLOAD] Skipped — a sweep is already active or waiting');
        return;
      }
      throw err;
    }
  }
}
