import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { MsGraphService, GraphMessage } from 'src/common/ms-graph/ms-graph.service';
import { VgEmailAnalysisQueueService } from './vg-email-analysis-queue.service';

const MAX_INBOX_MESSAGES_PER_POLL = 50;

@Injectable()
export class VgEmailMonitorTask {
  private readonly logger = new Logger(VgEmailMonitorTask.name);

  private readonly vgSenderEmails: Set<string>;

  constructor(
    private readonly msGraphService: MsGraphService,
    private readonly config: ConfigService,
    private readonly analysisQueue: VgEmailAnalysisQueueService,
  ) {
    const raw = this.config.get<string>('VG_SENDER_EMAILS') ?? '';
    this.vgSenderEmails = new Set(
      raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    );
    this.logger.log(
      `[VG-MONITOR] Watching for responses from ${this.vgSenderEmails.size} known VG sender(s)`,
    );
  }

  // Every 1.5 minutes (90 seconds)
  @Interval(90000)
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
    const senderAddress = message.from?.emailAddress?.address ?? '';

    if (!this.isVgSenderEmail(senderAddress)) {
      this.logger.debug(
        `[VG-MONITOR] Skipping messageId=${message.id} sender=${senderAddress} — not a known VG sender`,
      );
      return;
    }

    this.logger.log(
      `[VG-MONITOR] VG email detected — messageId=${message.id} sender=${senderAddress} subject="${message.subject ?? ''}"`,
    );

    await this.analysisQueue.enqueue({
      messageId: message.id,
      senderAddress,
      subject: message.subject ?? null,
      bodyContent: message.body?.content ?? null,
      bodyContentType: message.body?.contentType ?? null,
      receivedAt: message.receivedDateTime,
    });

    this.logger.log(`[VG-MONITOR] Enqueued messageId=${message.id}`);
    // markAsRead is handled by VgEmailAnalysisProcessor after classification
  }

  private isVgSenderEmail(senderAddress: string): boolean {
    return this.vgSenderEmails.has(senderAddress.toLowerCase());
  }
}
