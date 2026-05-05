import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MsGraphService, GraphMessage } from 'src/common/ms-graph/ms-graph.service';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';
import { DisputeCase, DisputeStatus } from './entities/dispute-case.entity';
import { AuditAction, CaseAuditLog } from './entities/case-audit-log.entity';
import { VgEmailInbox } from './entities/vg-email-inbox.entity';

const AWAITING_VG_STATUSES: DisputeStatus[] = [
  DisputeStatus.SUBMITTED_TO_VG,
  DisputeStatus.AWAITING_VG_RESPONSE,
];

const MAX_INBOX_MESSAGES_PER_POLL = 50;
const VG_MONITOR_SOURCE = 'vg-email-monitor';

@Injectable()
export class VgEmailMonitorTask {
  private readonly logger = new Logger(VgEmailMonitorTask.name);

  private readonly vgSenderEmails: Set<string>;

  constructor(
    @InjectRepository(DisputeCase)
    private readonly disputeCasesRepo: Repository<DisputeCase>,
    @InjectRepository(CaseAuditLog)
    private readonly auditLogRepo: Repository<CaseAuditLog>,
    @InjectRepository(VgEmailInbox)
    private readonly vgEmailInboxRepo: Repository<VgEmailInbox>,
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

  // Once daily at 08:00 AEST (22:00 UTC)
  @Cron('0 22 * * *')
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
    // Idempotency: skip if this message was already saved to the inbox
    const existing = await this.vgEmailInboxRepo.findOne({
      where: { message_id: message.id },
      select: ['id'],
    });
    if (existing) {
      await this.safeMarkAsRead(message.id);
      return;
    }

    const { senderAddress, subject, isVgSender, lodgmentRef, caseRef, pid } = this.extractEmailSignals(message);

    // Not from a known VG sender and no identifiers found — not a VG response
    if (!isVgSender && !lodgmentRef && !caseRef && !pid) {
      this.logger.debug(
        `[VG-MONITOR] Skipping messageId=${message.id} sender=${senderAddress} — not a VG sender and no identifiers found`,
      );
      await this.safeMarkAsRead(message.id);
      return;
    }

    this.logger.log(
      `[VG-MONITOR] VG email detected — messageId=${message.id} sender=${senderAddress} ` +
        `lodgmentRef=${lodgmentRef ?? '-'} caseRef=${caseRef ?? '-'} pid=${pid ?? '-'} subject="${subject}"`,
    );

    // Always save to inbox — captured emails (even unmatched) are available for AI analysis
    const inboxEntry = await this.saveToInbox(message, senderAddress);

    const disputeCase = await this.findMatchingCase(lodgmentRef, caseRef, pid, isVgSender);

    if (!disputeCase) {
      this.logger.warn(
        `[VG-MONITOR] No matching case for messageId=${message.id} ` +
          `lodgmentRef=${lodgmentRef ?? 'none'} caseRef=${caseRef ?? 'none'} pid=${pid ?? 'none'} sender=${senderAddress}. ` +
          `Email saved to vg_email_inbox (id=${inboxEntry.id}) for manual/AI review.`,
      );
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

    await this.recordVgResponseFromEmail(disputeCase, message, inboxEntry, senderAddress);
    await this.safeMarkAsRead(message.id);
  }

  private async saveToInbox(message: GraphMessage, senderAddress: string): Promise<VgEmailInbox> {
    const bodyContent = message.body?.content ?? null;
    const bodyPreview =
      message.bodyPreview ?? this.stripHtmlPreview(bodyContent);

    return this.vgEmailInboxRepo.save(
      this.vgEmailInboxRepo.create({
        message_id: message.id,
        sender_address: senderAddress,
        subject: message.subject ?? null,
        body_content: bodyContent,
        body_content_type: message.body?.contentType ?? null,
        body_preview: bodyPreview,
        received_at: new Date(message.receivedDateTime),
        processed_at: null,
        case_id: null,
        ai_outcome: null,
        ai_analyzed_at: null,
        ai_raw_response: null,
      }),
    );
  }

  private extractEmailSignals(message: GraphMessage): {
    senderAddress: string;
    subject: string;
    isVgSender: boolean;
    lodgmentRef: string | null;
    caseRef: string | null;
    pid: string | null;
  } {
    const senderAddress = message.from?.emailAddress?.address ?? '';
    const subject = message.subject ?? '';
    const body = message.body?.content ?? '';
    return {
      senderAddress,
      subject,
      isVgSender: this.isVgSenderEmail(senderAddress),
      lodgmentRef: this.extractLodgmentReference(subject, body),
      caseRef: this.extractCaseReference(subject, body),
      pid: this.extractPid(subject, body),
    };
  }

  private isVgSenderEmail(senderAddress: string): boolean {
    return this.vgSenderEmails.has(senderAddress.toLowerCase());
  }

  private extractLodgmentReference(subject: string, body: string): string | null {
    const plain = body.replace(/<[^>]+>/g, ' ');
    const pattern = /\bVG-[A-Z0-9-]+-\d+\b/i;
    return subject.match(pattern)?.[0] ?? plain.match(pattern)?.[0] ?? null;
  }

  private extractCaseReference(subject: string, body: string): string | null {
    const plain = body.replace(/<[^>]+>/g, ' ');
    const pattern = /\bLTD-\d{4}-[A-Z0-9]+-\d+\b/i;
    return subject.match(pattern)?.[0] ?? plain.match(pattern)?.[0] ?? null;
  }

  private extractPid(subject: string, body: string): string | null {
    const plain = body.replace(/<[^>]+>/g, ' ');
    const text = `${subject} ${plain}`;
    return text.match(/\bPID[:\s#]*(\d+)\b/i)?.[1] ?? null;
  }

  private async findMatchingCase(
    lodgmentRef: string | null,
    caseRef: string | null,
    pid: string | null,
    isVgSender: boolean,
  ): Promise<DisputeCase | null> {
    const relations = ['client', 'property', 'assigned_accountant'];

    if (lodgmentRef) {
      const matched = await this.disputeCasesRepo.findOne({
        where: { lodgment_reference_number: lodgmentRef, status: In(AWAITING_VG_STATUSES) },
        relations,
      });
      if (matched) {
        this.logger.log(`[VG-MONITOR] Matched by lodge-ref — caseRef=${matched.case_reference}`);
        return matched;
      }
    }

    if (caseRef) {
      const matched = await this.disputeCasesRepo.findOne({
        where: { case_reference: caseRef, status: In(AWAITING_VG_STATUSES) },
        relations,
      });
      if (matched) {
        this.logger.log(`[VG-MONITOR] Matched by case-ref — caseRef=${matched.case_reference}`);
        return matched;
      }
    }

    if (pid) {
      const matched = await this.disputeCasesRepo
        .createQueryBuilder('dc')
        .innerJoinAndSelect('dc.property', 'p')
        .leftJoinAndSelect('dc.client', 'c')
        .leftJoinAndSelect('dc.assigned_accountant', 'a')
        .where('p.pid = :pid', { pid })
        .andWhere('dc.status IN (:...statuses)', { statuses: AWAITING_VG_STATUSES })
        .getOne();
      if (matched) {
        this.logger.log(`[VG-MONITOR] Matched by pid — caseRef=${matched.case_reference}`);
        return matched;
      }
    }

    // Fallback: known VG sender, no identifiers — only safe when exactly one case is pending
    if (isVgSender) {
      const pending = await this.disputeCasesRepo.find({
        where: { status: In(AWAITING_VG_STATUSES) },
        relations,
        order: { submitted_at: 'ASC' },
      });
      if (pending.length === 1) {
        this.logger.log(`[VG-MONITOR] Matched by fallback (single pending case) — caseRef=${pending[0].case_reference}`);
        return pending[0];
      }
      this.logger.warn(
        `[VG-MONITOR] ${pending.length} case(s) awaiting VG response — cannot auto-match without identifiers`,
      );
    }

    return null;
  }

  private async recordVgResponseFromEmail(
    disputeCase: DisputeCase,
    message: GraphMessage,
    inboxEntry: VgEmailInbox,
    senderAddress: string,
  ): Promise<void> {
    try {
      const receivedAt = new Date(message.receivedDateTime);
      await this.persistVgResponse(disputeCase, message, inboxEntry, senderAddress, receivedAt);
      this.logger.log(
        `[VG-MONITOR] VG response recorded — caseRef=${disputeCase.case_reference} ` +
          `inboxId=${inboxEntry.id}`,
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
    inboxEntry: VgEmailInbox,
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

    // Link inbox entry to the matched case and mark processed
    inboxEntry.case_id = disputeCase.id;
    inboxEntry.processed_at = new Date();
    await this.vgEmailInboxRepo.save(inboxEntry);

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

  /** Strip HTML tags and collapse whitespace for a plain-text preview. */
  private stripHtmlPreview(html: string | null, maxLength = 500): string | null {
    if (!html) return null;
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }
}
