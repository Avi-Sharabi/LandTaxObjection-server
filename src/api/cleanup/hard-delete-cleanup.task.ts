import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';

// Production default: daily at 02:00 UTC.
// Override with CLEANUP_CRON_SCHEDULE env var (e.g. "* * * * *" for every-minute QA runs).
const DEFAULT_CRON = '0 2 * * *';

const DEFAULT_RETENTION_DAYS = 60;

@Injectable()
export class HardDeleteCleanupTask implements OnModuleInit {
  private readonly logger = new Logger(HardDeleteCleanupTask.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const expression = this.config.get<string>('CLEANUP_CRON_SCHEDULE') || DEFAULT_CRON;
    const job = new CronJob(expression, () => { void this.runCleanup(); });
    this.schedulerRegistry.addCronJob('hard-delete-cleanup', job);
    job.start();
    this.logger.log(`[CLEANUP] Scheduled with cron: "${expression}"`);
  }

  async runCleanup(): Promise<void> {
    const threshold = this.resolveThreshold();

    this.logger.log(
      `[CLEANUP] Starting hard-delete — threshold=${threshold.toISOString()}`,
    );

    // Cases purged first to satisfy the dispute_cases.client_id FK on clients.
    await this.purgeDisputeCases(threshold);
    await this.purgeClients(threshold);

    this.logger.log('[CLEANUP] Hard-delete cleanup complete');
  }

  // CLEANUP_RETENTION_MINUTES takes precedence (use for QA).
  // Falls back to CLEANUP_RETENTION_DAYS, then DEFAULT_RETENTION_DAYS (60) if neither is set.
  private resolveThreshold(): Date {
    const minutes = this.config.get<number>('CLEANUP_RETENTION_MINUTES');
    if (minutes != null) {
      this.logger.log(`[CLEANUP] Retention source: CLEANUP_RETENTION_MINUTES=${minutes}m`);
      return new Date(Date.now() - minutes * 60 * 1000);
    }
    const days = this.config.get<number>('CLEANUP_RETENTION_DAYS') ?? DEFAULT_RETENTION_DAYS;
    this.logger.log(`[CLEANUP] Retention source: ${this.config.get('CLEANUP_RETENTION_DAYS') != null ? 'CLEANUP_RETENTION_DAYS' : 'default'}=${days}d`);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  private async purgeDisputeCases(threshold: Date): Promise<void> {
    try {
      const [{ count }] = await this.dataSource.query<[{ count: number }]>(
        `SELECT COUNT(*)::int AS count
           FROM dispute_cases
          WHERE deleted_at IS NOT NULL
            AND deleted_at <= $1`,
        [threshold],
      );

      if (count === 0) {
        this.logger.log('[CLEANUP] No soft-deleted dispute cases to purge');
        return;
      }

      this.logger.log(`[CLEANUP] Purging ${count} dispute case(s) and their child records`);

      const caseSubquery = `SELECT id FROM dispute_cases WHERE deleted_at IS NOT NULL AND deleted_at <= $1`;

      // Delete child records in FK-safe order before removing the parent cases.
      const caseChildren: Array<{ table: string; fkCol: string }> = [
        { table: 'dispute_objection_reasons', fkCol: 'dispute_case_id' },
        { table: 'dispute_evidence_issues',   fkCol: 'dispute_case_id' },
        { table: 'package_documents',         fkCol: 'dispute_case_id' },
        { table: 'comparable_sales',          fkCol: 'dispute_case_id' },
        { table: 'dispute_documents',         fkCol: 'dispute_id' },
        { table: 'dispute_legal_grounds',     fkCol: 'dispute_id' },
        { table: 'dispute_constraints',       fkCol: 'dispute_id' },
      ];

      for (const { table, fkCol } of caseChildren) {
        const deleted = await this.dataSource.query<{ id: string }[]>(
          `DELETE FROM "${table}"
            WHERE "${fkCol}" IN (${caseSubquery})
           RETURNING id`,
          [threshold],
        );
        if (deleted.length > 0) {
          this.logger.log(`[CLEANUP]   → ${table}: removed ${deleted.length} row(s)`);
        }
      }

      await this.dataSource.query(
        `DELETE FROM dispute_cases
          WHERE deleted_at IS NOT NULL
            AND deleted_at <= $1`,
        [threshold],
      );

      this.logger.log(`[CLEANUP] Hard-deleted ${count} dispute case(s)`);
    } catch (err) {
      this.logger.error(
        `[CLEANUP] Failed to purge dispute cases — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async purgeClients(threshold: Date): Promise<void> {
    try {
      const [{ count }] = await this.dataSource.query<[{ count: number }]>(
        `SELECT COUNT(*)::int AS count
           FROM clients
          WHERE deleted_at IS NOT NULL
            AND deleted_at <= $1`,
        [threshold],
      );

      if (count === 0) {
        this.logger.log('[CLEANUP] No soft-deleted clients to purge');
        return;
      }

      this.logger.log(`[CLEANUP] Purging ${count} client(s) and their child records`);

      const clientSubquery = `SELECT id FROM clients WHERE deleted_at IS NOT NULL AND deleted_at <= $1`;

      // valuation_notices must be removed before properties (valuation_notices.property_id FK).
      // Guard against notices still referenced by active dispute_cases from other clients.
      const vnDeleted = await this.dataSource.query<{ id: string }[]>(
        `DELETE FROM valuation_notices
          WHERE property_id IN (
                  SELECT id FROM properties WHERE client_id IN (${clientSubquery})
                )
            AND id NOT IN (
                  SELECT valuation_notice_id FROM dispute_cases WHERE deleted_at IS NULL
                )
         RETURNING id`,
        [threshold],
      );
      if (vnDeleted.length > 0) {
        this.logger.log(`[CLEANUP]   → valuation_notices: removed ${vnDeleted.length} row(s)`);
      }

      // properties.client_id FK — delete after valuation_notices are cleared.
      const propDeleted = await this.dataSource.query<{ id: string }[]>(
        `DELETE FROM properties
          WHERE client_id IN (${clientSubquery})
         RETURNING id`,
        [threshold],
      );
      if (propDeleted.length > 0) {
        this.logger.log(`[CLEANUP]   → properties: removed ${propDeleted.length} row(s)`);
      }

      await this.dataSource.query(
        `DELETE FROM clients
          WHERE deleted_at IS NOT NULL
            AND deleted_at <= $1`,
        [threshold],
      );

      this.logger.log(`[CLEANUP] Hard-deleted ${count} client(s)`);
    } catch (err) {
      this.logger.error(
        `[CLEANUP] Failed to purge clients — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
