import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { DisputeCasesService } from './dispute-cases.service';

// Default: daily at 22:00 UTC (08:00 AEST / UTC+10)
const DEFAULT_CRON_SCHEDULE = '0 22 * * *';

@Injectable()
export class VGResponseMonitorScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(VGResponseMonitorScheduler.name);

  constructor(
    private readonly disputeCasesService: DisputeCasesService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const schedule =
      this.config.get<string>('VG_FOLLOWUP_CRON_SCHEDULE') || DEFAULT_CRON_SCHEDULE;

    const job = new CronJob(schedule, () => void this.runVGFollowUpCheck());
    this.schedulerRegistry.addCronJob('vg-response-monitor', job);
    job.start();

    this.logger.log(`[VG-FOLLOW-UP] Scheduled with cron: "${schedule}"`);
  }

  async runVGFollowUpCheck(): Promise<void> {
    this.logger.log('[VG-FOLLOW-UP] Starting VG response monitor run');

    const cases = await this.disputeCasesService.findCasesDueForVGFollowUp();
    this.logger.log(`[VG-FOLLOW-UP] ${cases.length} case(s) due for follow-up`);

    let sent = 0;
    let failed = 0;

    // Sequential processing intentional — avoids overwhelming Azure ACS with concurrent sends
    for (const disputeCase of cases) {
      try {
        await this.disputeCasesService.sendVGFollowUp(disputeCase.id);
        sent++;
        this.logger.log(
          `[VG-FOLLOW-UP] Follow-up sent — caseId=${disputeCase.id} followUpCount=${disputeCase.vg_follow_up_count + 1}`,
        );
      } catch (err) {
        failed++;
        this.logger.warn(
          `[VG-FOLLOW-UP] Failed to send follow-up — caseId=${disputeCase.id} err=${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `[VG-FOLLOW-UP] Run complete — checked=${cases.length} sent=${sent} failed=${failed}`,
    );
  }
}