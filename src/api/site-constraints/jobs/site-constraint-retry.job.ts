import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SiteConstraintsService } from '../site-constraints.service';

/**
 * SiteConstraintRetryJob
 *
 * Runs daily at 08:00 AEST to re-check document uploads for all constraints
 * still in `pending_documents` status. Re-sends missing-doc emails via
 * AzureEmailService until the client uploads the required files.
 *
 * Override schedule with CONSTRAINT_RETRY_CRON env var (useful for staging).
 */
@Injectable()
export class SiteConstraintRetryJob {
  private readonly logger = new Logger(SiteConstraintRetryJob.name);

  constructor(private readonly service: SiteConstraintsService) {}

  @Cron(process.env.CONSTRAINT_RETRY_CRON ?? '0 8 * * *', {
    name: 'site-constraint-retry',
    timeZone: 'Australia/Sydney',
  })
  async handleRetry(): Promise<void> {
    this.logger.log('[CRON] Site constraint retry sweep started…');

    const pending = await this.service.findAllPendingDocuments();

    if (!pending.length) {
      this.logger.log('[CRON] No pending constraints found. Sweep complete.');
      return;
    }

    this.logger.log(`[CRON] Processing ${pending.length} pending constraint(s)…`);

    const results = await Promise.allSettled(
      pending.map((c) => this.service.retryVerification(c.id)),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    this.logger.log(`[CRON] Sweep complete — total=${pending.length} failed=${failed}`);
  }
}
