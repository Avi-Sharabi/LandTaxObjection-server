import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ConfigService } from '@nestjs/config';
import { MsGraphService, GraphMessage } from 'src/common/ms-graph/ms-graph.service';
import { VgEmailAnalysisService } from './vg-email-analysis.service';

const MAX_INBOX_MESSAGES_PER_POLL = 50;
// 08:00 AEST daily (22:00 UTC). Override with VG_EMAIL_POLL_CRON in .env.
const DEFAULT_POLL_CRON = '0 22 * * *';

@Injectable()
export class VgEmailMonitorTask implements OnModuleInit {
  private readonly logger = new Logger(VgEmailMonitorTask.name);
  private readonly processedMessageIds = new Set<string>();

  private readonly vgSenderEmails: Set<string>;

  constructor(
    private readonly msGraphService: MsGraphService,
    private readonly config: ConfigService,
    private readonly analysisService: VgEmailAnalysisService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    const raw = this.config.get<string>('VG_SENDER_EMAILS') ?? '';
    this.vgSenderEmails = new Set(
      raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    );
    this.logger.log(
      `[VG-MONITOR] Watching for responses from ${this.vgSenderEmails.size} known VG sender(s)`,
    );
  }

  onModuleInit() {
    const expression = this.config.get<string>('VG_EMAIL_POLL_CRON') ?? DEFAULT_POLL_CRON;
    const job = new CronJob(expression, () => { void this.pollVgMailbox(); });
    this.schedulerRegistry.addCronJob('vg-email-monitor', job);
    job.start();
    this.logger.log(`[VG-MONITOR] Scheduled with cron: "${expression}"`);
  }

  public async pollVgMailbox(): Promise<void> {
    this.logger.log(
      `[VG-MONITOR] Starting VG mailbox poll — inbox=${this.msGraphService.mailboxUserId}`,
    );

    let messages: GraphMessage[];

    try {
      messages = await this.msGraphService.fetchInboxMessages(MAX_INBOX_MESSAGES_PER_POLL);
    } catch (err) {
      this.logger.error(
        `[VG-MONITOR] Failed to fetch inbox — ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    this.logger.log(`[VG-MONITOR] ${messages.length} message(s) found`);
    messages.forEach((m, i) =>
      this.logger.log(
        `[VG-MONITOR] [${i + 1}/${messages.length}] from=${m.from?.emailAddress?.address} ` +
          `received=${m.receivedDateTime} subject="${m.subject}"`,
      ),
    );

    for (const message of messages) {
      await this.processMessage(message);
    }

    this.logger.log('[VG-MONITOR] Poll complete');
  }

  private async processMessage(message: GraphMessage): Promise<void> {
    if (this.processedMessageIds.has(message.id)) {
      this.logger.log(
        `[VG-MONITOR] Skipping messageId=${message.id} — already processed this run`,
      );
      return;
    }

    if (message.isRead) {
      this.logger.log(
        `[VG-MONITOR] Skipping messageId=${message.id} — isRead=true (already handled)`,
      );
      this.processedMessageIds.add(message.id);
      return;
    }

    const senderAddress = message.from?.emailAddress?.address ?? '';

    if (!this.isVgSenderEmail(senderAddress)) {
      this.logger.debug(
        `[VG-MONITOR] Skipping messageId=${message.id} sender=${senderAddress} — not a known VG sender`,
      );
      this.processedMessageIds.add(message.id);
      return;
    }

    this.logger.log(
      `[VG-MONITOR] VG email detected — messageId=${message.id} sender=${senderAddress} subject="${message.subject ?? ''}"`,
    );

    await this.analysisService.processEmail(
      message.id,
      message.subject ?? null,
      message.body?.content ?? null,
    );

    this.processedMessageIds.add(message.id);
  }

  private isVgSenderEmail(senderAddress: string): boolean {
    return this.vgSenderEmails.has(senderAddress.toLowerCase());
  }
}
