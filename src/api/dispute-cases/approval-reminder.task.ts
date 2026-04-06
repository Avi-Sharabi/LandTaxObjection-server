import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DisputeCase, DisputeStatus } from './entities/dispute-case.entity';
import { DisputeCasesService } from './dispute-cases.service';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';

const MAX_REMINDERS = 3;

@Injectable()
export class ApprovalReminderTask {
  private readonly logger = new Logger(ApprovalReminderTask.name);

  constructor(
    @InjectRepository(DisputeCase)
    private readonly repo: Repository<DisputeCase>,
    private readonly disputeCasesService: DisputeCasesService,
    private readonly azureEmailService: AzureEmailService,
    private readonly config: ConfigService,
  ) {}

  // Runs daily at 22:00 UTC (08:00 AEST)
  @Cron('0 22 * * *')
  async runDailyReminderCheck(): Promise<void> {
    this.logger.log('[APPROVAL-REMINDER] Starting daily reminder check');

    const thresholdMinutes = this.config.get<number>('REMINDER_THRESHOLD_MINUTES') ?? 7200; // default: 5 days
    const thresholdDate = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    const cases = await this.repo.find({
      where: [
        // First reminder: package sent > threshold ago, no reminder sent yet.
        // LessThan naturally excludes NULL rows in PostgreSQL, so no explicit NOT NULL needed.
        {
          status: DisputeStatus.AWAITING_CLIENT_APPROVAL,
          client_approved_at: IsNull(),
          client_approval_requested_at: LessThan(thresholdDate),
          last_reminder_sent_at: IsNull(),
        },
        // Subsequent reminders: last reminder sent > threshold ago
        {
          status: DisputeStatus.AWAITING_CLIENT_APPROVAL,
          client_approved_at: IsNull(),
          last_reminder_sent_at: LessThan(thresholdDate),
        },
      ],
      relations: ['client', 'property', 'valuation_notice'],
    });

    const eligible = cases.filter((c) => c.reminder_count < MAX_REMINDERS);
    const capped = cases.filter((c) => c.reminder_count >= MAX_REMINDERS);

    for (const c of capped) {
      this.logger.warn(
        `[APPROVAL-REMINDER] Max reminders reached — caseId=${c.id} reminder_count=${c.reminder_count} — manual follow-up required`,
      );
    }

    this.logger.log(`[APPROVAL-REMINDER] ${eligible.length} case(s) eligible for reminder`);

    for (const disputeCase of eligible) {
      try {
        const token = randomUUID();
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);

        const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';
        const approvalLink = `${frontendUrl}/approve-package?token=${token}`;
        const propertyAddress = [disputeCase.property.address, disputeCase.property.suburb]
          .filter(Boolean)
          .join(', ');
        const taxYear = String(new Date(disputeCase.valuation_notice.valuation_date).getFullYear());

        const attachments = await this.disputeCasesService.buildAttachments(disputeCase.id);

        await this.azureEmailService.sendObjectionPackageReminder({
          sendTo: disputeCase.client.email ?? '',
          clientName: disputeCase.client.name,
          propertyAddress,
          taxYear,
          approvalLink,
          firmName: this.config.get<string>('FIRM_NAME') ?? 'Your Firm',
          contactEmail: this.config.get<string>('CONTACT_EMAIL') ?? '',
          attachments,
        });

        disputeCase.client_approval_token = token;
        disputeCase.client_approval_token_expires_at = expires;
        disputeCase.last_reminder_sent_at = new Date();
        disputeCase.reminder_count += 1;

        await this.repo.save(disputeCase);

        this.logger.log(
          `[APPROVAL-REMINDER] Reminder sent — caseId=${disputeCase.id} reminder_count=${disputeCase.reminder_count}`,
        );
      } catch (err) {
        this.logger.error(
          `[APPROVAL-REMINDER] Failed — caseId=${disputeCase.id} err=${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log('[APPROVAL-REMINDER] Daily reminder check complete');
  }
}
