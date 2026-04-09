import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DisputeCase, DisputeStatus } from './entities/dispute-case.entity';
import { CaseAuditLog } from './entities/case-audit-log.entity';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';

const VG_FOLLOW_UP_STATUSES = [DisputeStatus.SUBMITTED_TO_VG, DisputeStatus.AWAITING_VG_RESPONSE];
const FOLLOW_UP_THRESHOLD_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

@Injectable()
export class VGResponseMonitorTask {
  private readonly logger = new Logger(VGResponseMonitorTask.name);

  constructor(
    @InjectRepository(DisputeCase)
    private readonly repo: Repository<DisputeCase>,
    @InjectRepository(CaseAuditLog)
    private readonly auditLogRepo: Repository<CaseAuditLog>,
    private readonly azureEmailService: AzureEmailService,
    private readonly config: ConfigService,
  ) {}

  // Runs daily at 22:00 UTC (08:00 AEST) by default; override via VG_FOLLOWUP_CRON_SCHEDULE
  // @Cron(process.env.VG_FOLLOWUP_CRON_SCHEDULE ?? '0 22 * * *')
  @Cron('* * * * *')
  async runDailyVGFollowUpCheck(): Promise<void> {
    this.logger.log('[VG-RESPONSE-MONITOR] Starting daily VG follow-up check');

    const threshold = new Date(Date.now() - FOLLOW_UP_THRESHOLD_MS);

    const cases = await this.repo.find({
      where: [
        // First follow-up: submitted ≥ 5 days ago, no follow-up sent yet
        {
          status: In(VG_FOLLOW_UP_STATUSES),
          submitted_at: LessThan(threshold),
          last_vg_follow_up_sent_at: IsNull(),
        },
        // Subsequent follow-ups: last follow-up sent ≥ 5 days ago
        {
          status: In(VG_FOLLOW_UP_STATUSES),
          last_vg_follow_up_sent_at: LessThan(threshold),
        },
      ],
      relations: ['property'],
    });

    this.logger.log(`[VG-RESPONSE-MONITOR] ${cases.length} case(s) due for follow-up`);

    const aviEmail = this.config.getOrThrow<string>('AVI_EMAIL');
    const firmName = this.config.get<string>('FIRM_NAME') ?? 'Your Firm';
    const contactEmail = this.config.get<string>('CONTACT_EMAIL') ?? '';

    let sentCount = 0;
    let failureCount = 0;

    for (const disputeCase of cases) {
      try {
        const propertyAddress = [disputeCase.property.address, disputeCase.property.suburb]
          .filter(Boolean)
          .join(', ');

        const submissionDate = disputeCase.submitted_at
          ? disputeCase.submitted_at.toLocaleDateString('en-AU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })
          : 'Unknown';

        const nextFollowUpCount = disputeCase.vg_follow_up_count + 1;

        await this.azureEmailService.sendVGFollowUpEnquiry({
          sendTo: aviEmail,
          lodgmentReference: disputeCase.case_reference,
          propertyAddress,
          submissionDate,
          followUpCount: String(nextFollowUpCount),
          firmName,
          contactEmail,
        });

        disputeCase.vg_follow_up_count = nextFollowUpCount;
        disputeCase.last_vg_follow_up_sent_at = new Date();
        await this.repo.save(disputeCase);

        await this.auditLogRepo.save(
          this.auditLogRepo.create({
            action: 'VG_FOLLOW_UP_SENT',
            case_id: disputeCase.id,
            metadata: { vgFollowUpCount: nextFollowUpCount },
          }),
        );

        sentCount += 1;
        this.logger.log(
          `[VG-RESPONSE-MONITOR] Follow-up sent — caseId=${disputeCase.id} vg_follow_up_count=${nextFollowUpCount}`,
        );
      } catch (err) {
        failureCount += 1;
        this.logger.warn(
          `[VG-RESPONSE-MONITOR] Failed — caseId=${disputeCase.id} err=${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `[VG-RESPONSE-MONITOR] Run complete — checked=${cases.length} sent=${sentCount} failed=${failureCount}`,
    );
  }
}
