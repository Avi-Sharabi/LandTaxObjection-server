import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MsGraphService, GraphMessage } from 'src/common/ms-graph/ms-graph.service';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';
import { DisputeCase, DisputeStatus } from './entities/dispute-case.entity';
import { AuditAction, CaseAuditLog } from './entities/case-audit-log.entity';

// Statuses eligible for automated VG email matching
const AWAITING_VG_STATUSES: DisputeStatus[] = [
  DisputeStatus.SUBMITTED_TO_VG,
  DisputeStatus.AWAITING_VG_RESPONSE,
];

const MAX_INBOX_MESSAGES_PER_POLL = 50;

// Identifies audit log entries created by this automated monitor (no human performer)
const VG_MONITOR_SOURCE = 'vg-email-monitor';

@Injectable()
export class VgEmailMonitorTask {
  private readonly logger = new Logger(VgEmailMonitorTask.name);

  /** Normalised set of known VG sender email addresses, loaded once from config. */
  private readonly vgSenderEmails: Set<string>;

  constructor(
    @InjectRepository(DisputeCase)
    private readonly disputeCasesRepo: Repository<DisputeCase>,
    @InjectRepository(CaseAuditLog)
    private readonly auditLogRepo: Repository<CaseAuditLog>,
    private readonly msGraphService: MsGraphService,
    private readonly azureEmailService: AzureEmailService,
    private readonly config: ConfigService,
  ) {
    const raw = this.config.get<string>('VG_SENDER_EMAILS') ?? '';
    this.vgSenderEmails = new Set(
      raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    );
    this.logger.log(
      `[VG-MONITOR] Watching for responses from ${this.vgSenderEmails.size} known VG sender(s)`,
    );
  }

  // Twice daily: 08:00 and 12:00 AEST (22:00 and 02:00 UTC)
  @Cron('0 22,2 * * *')
  async pollVgMailbox(): Promise<void> {
    this.logger.log('[VG-MONITOR] Starting VG mailbox poll');

    let messages: GraphMessage[];

    try {
      messages = await this.msGraphService.fetchUnreadInboxMessages(MAX_INBOX_MESSAGES_PER_POLL);
    } catch (err) {
      this.logger.error(
        `[VG-MONITOR] Failed to fetch inbox — ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    this.logger.log(`[VG-MONITOR] ${messages.length} unread message(s) found`);

    for (const message of messages) {
      await this.processMessage(message);
    }

    this.logger.log('[VG-MONITOR] Poll complete');
  }

  private async processMessage(message: GraphMessage): Promise<void> {
    // Guard against re-processing the same email on repeated twice-daily polls
    if (await this.isAlreadyProcessed(message.id)) {
      await this.safeMarkAsRead(message.id);
      return;
    }

    const { senderAddress, subject, isVgSender, lodgmentRef } = this.extractEmailSignals(message);

    if (!isVgSender && !lodgmentRef) {
      return;
    }

    this.logger.log(
      `[VG-MONITOR] VG email detected — messageId=${message.id} sender=${senderAddress} ` +
        `lodgmentRef=${lodgmentRef ?? 'not found'} subject="${subject}"`,
    );

    const disputeCase = await this.findMatchingCase(lodgmentRef, isVgSender);

    if (!disputeCase) {
      this.logger.warn(
        `[VG-MONITOR] No matching case — messageId=${message.id} lodgmentRef=${lodgmentRef ?? 'none'} sender=${senderAddress}`,
      );
      // Mark read so it won't block subsequent polls; the assessor can review manually
      await this.safeMarkAsRead(message.id);
      return;
    }

    if (disputeCase.status === DisputeStatus.VG_RESPONSE_RECEIVED) {
      this.logger.log(
        `[VG-MONITOR] VG response already recorded for case ${disputeCase.case_reference} — skipping`,
      );
      await this.safeMarkAsRead(message.id);
      return;
    }

    await this.recordVgResponseFromEmail(disputeCase, message, senderAddress);
    await this.safeMarkAsRead(message.id);
  }

  private async isAlreadyProcessed(messageId: string): Promise<boolean> {
    const existing = await this.disputeCasesRepo.findOne({
      where: { vg_email_message_id: messageId },
      select: ['id'],
    });
    return existing !== null;
  }

  private extractEmailSignals(message: GraphMessage): {
    senderAddress: string;
    subject: string;
    isVgSender: boolean;
    lodgmentRef: string | null;
  } {
    const senderAddress = message.from?.emailAddress?.address ?? '';
    const subject = message.subject ?? '';
    return {
      senderAddress,
      subject,
      isVgSender: this.isVgSenderEmail(senderAddress),
      lodgmentRef: this.extractLodgmentReference(subject, message.body?.content ?? ''),
    };
  }

  private isVgSenderEmail(senderAddress: string): boolean {
    return this.vgSenderEmails.has(senderAddress.toLowerCase());
  }

  /**
   * Extract our internal lodgment reference (format: VG-{caseRef}-{timestamp})
   * from the email subject or body text.
   */
  private extractLodgmentReference(subject: string, body: string): string | null {
    const plainBody = body.replace(/<[^>]+>/g, ' ');
    const pattern = /\bVG-[A-Z0-9-]+-\d+\b/i;

    return subject.match(pattern)?.[0] ?? plainBody.match(pattern)?.[0] ?? null;
  }

  private async findMatchingCase(
    lodgmentRef: string | null,
    isVgSender: boolean,
  ): Promise<DisputeCase | null> {
    // Primary match: lodgment reference number
    if (lodgmentRef) {
      const matched = await this.disputeCasesRepo.findOne({
        where: { lodgment_reference_number: lodgmentRef, status: In(AWAITING_VG_STATUSES) },
        relations: ['client', 'property', 'assigned_accountant'],
      });
      if (matched) return matched;
    }

    // Fallback: if from a known VG sender but no ref — only safe when exactly one case is pending
    if (isVgSender && !lodgmentRef) {
      const pending = await this.disputeCasesRepo.find({
        where: { status: In(AWAITING_VG_STATUSES) },
        relations: ['client', 'property', 'assigned_accountant'],
        order: { submitted_at: 'ASC' },
      });
      if (pending.length === 1) return pending[0];
      this.logger.warn(
        `[VG-MONITOR] ${pending.length} case(s) awaiting VG response — cannot auto-match without lodgment ref`,
      );
    }

    return null;
  }

  private async recordVgResponseFromEmail(
    disputeCase: DisputeCase,
    message: GraphMessage,
    senderAddress: string,
  ): Promise<void> {
    try {
      const receivedAt = new Date(message.receivedDateTime);
      await this.persistVgResponse(disputeCase, message, senderAddress, receivedAt);
      this.logger.log(
        `[VG-MONITOR] VG response recorded — caseRef=${disputeCase.case_reference}`,
      );
      this.notifyAssessor(disputeCase, message, senderAddress, receivedAt);
    } catch (err) {
      this.logger.error(
        `[VG-MONITOR] Failed to record VG response for case ${disputeCase.case_reference}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async persistVgResponse(
    disputeCase: DisputeCase,
    message: GraphMessage,
    senderAddress: string,
    receivedAt: Date,
  ): Promise<void> {
    disputeCase.status = DisputeStatus.VG_RESPONSE_RECEIVED;
    disputeCase.vg_response_received_at = receivedAt;
    disputeCase.vg_email_message_id = message.id;
    disputeCase.vg_response_notes =
      `Email received from ${senderAddress} at ${receivedAt.toISOString()}. ` +
      `Subject: ${message.subject ?? '(no subject)'}`;

    await this.disputeCasesRepo.save(disputeCase);

    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        case_id: disputeCase.id,
        action: AuditAction.VG_EMAIL_RESPONSE_DETECTED,
        performed_by: null,
        source: VG_MONITOR_SOURCE,
        response_notes: disputeCase.vg_response_notes,
      }),
    );
  }

  private notifyAssessor(
    disputeCase: DisputeCase,
    message: GraphMessage,
    senderAddress: string,
    receivedAt: Date,
  ): void {
    const assessorEmail =
      disputeCase.assigned_accountant?.email ??
      this.config.get<string>('ASSESSOR_EMAIL') ??
      this.config.get<string>('CONTACT_EMAIL') ??
      '';

    if (!assessorEmail) return;

    this.azureEmailService
      .sendVgResponseDetectedNotification({
        sendTo: assessorEmail,
        caseReference: disputeCase.case_reference,
        clientName: disputeCase.client?.name ?? 'Client',
        propertyAddress: this.buildPropertyAddress(disputeCase.property),
        jurisdiction: disputeCase.jurisdiction,
        receivedAt: receivedAt.toLocaleString('en-AU', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        senderEmail: senderAddress,
        emailSubject: message.subject ?? '(no subject)',
      })
      .catch((err: unknown) => {
        this.logger.error(
          `[VG-MONITOR] Assessor notification failed for case ${disputeCase.case_reference}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  private async safeMarkAsRead(messageId: string): Promise<void> {
    try {
      await this.msGraphService.markMessageAsRead(messageId);
    } catch (err) {
      this.logger.warn(
        `[VG-MONITOR] Failed to mark message ${messageId} as read: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private buildPropertyAddress(
    property: {
      address: string | null;
      suburb: string | null;
      state: string | null;
      postcode: string | null;
    } | null,
  ): string {
    if (!property) return 'Address not available';
    return [property.address, property.suburb, property.state, property.postcode]
      .filter(Boolean)
      .join(', ');
  }
}
