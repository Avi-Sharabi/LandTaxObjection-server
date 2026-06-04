import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DeadlineStatusService } from './deadline-status.service';

@Injectable()
export class DeadlineSchedulerTask {
  private readonly logger = new Logger(DeadlineSchedulerTask.name);

  constructor(private readonly deadlineStatusService: DeadlineStatusService) {}

  @Cron('0 * * * *')
  async runHourlyStatusTransitions(): Promise<void> {
    this.logger.log('[DEADLINE-SCHEDULER] Starting hourly status transition run');
    try {
      const result = await this.deadlineStatusService.runStatusTransitions();
      this.logger.log(
        `[DEADLINE-SCHEDULER] Complete — updated=${result.updated} breached=${result.breached}`,
      );
    } catch (err) {
      this.logger.error(
        `[DEADLINE-SCHEDULER] Failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
