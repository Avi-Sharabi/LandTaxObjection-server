import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { ConfigService } from '@nestjs/config';
import {
  Deadline,
  DeadlineStatus,
} from './entities/deadline.entity';
import {
  DeadlineActivityLog,
  DeadlineActivityAction,
} from './entities/deadline-activity-log.entity';
import { TERMINAL_STATUSES, SYSTEM_ACTOR_ID, MS_PER_DAY } from './deadlines.constants';

const BATCH_SIZE = 500;

@Injectable()
export class DeadlineStatusService {
  private readonly logger = new Logger(DeadlineStatusService.name);
  private readonly dueSoonDays: number;
  private readonly atRiskDays: number;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.dueSoonDays = this.config.get<number>('DEADLINE_DUE_SOON_DAYS') ?? 7;
    this.atRiskDays = this.config.get<number>('DEADLINE_AT_RISK_DAYS') ?? 3;
  }

  computeStatus(dueDate: Date, now: Date): DeadlineStatus {
    const daysUntilDue = (dueDate.getTime() - now.getTime()) / MS_PER_DAY;

    if (daysUntilDue < 0) return DeadlineStatus.OVERDUE;
    if (daysUntilDue <= this.atRiskDays) return DeadlineStatus.AT_RISK;
    if (daysUntilDue <= this.dueSoonDays) return DeadlineStatus.DUE_SOON;
    return DeadlineStatus.UPCOMING;
  }

  /**
   * Transitions non-terminal deadlines to their correct status based on the current time.
   * Processes up to BATCH_SIZE records per call — cron callers should loop until updated === 0
   * to guarantee full convergence when more than BATCH_SIZE deadlines are active.
   *
   * When called without a manager (e.g. from the cron scheduler), opens its own transaction
   * so status updates and audit logs are always written atomically.
   */
  async runStatusTransitions(manager?: EntityManager): Promise<{ updated: number; breached: number }> {
    if (manager) {
      return this.executeTransitions(manager);
    }
    return this.dataSource.transaction((txManager) => this.executeTransitions(txManager));
  }

  private async executeTransitions(manager: EntityManager): Promise<{ updated: number; breached: number }> {
    const repo = manager.getRepository(Deadline);
    const logRepo = manager.getRepository(DeadlineActivityLog);

    const deadlines = await repo.find({
      where: { status: Not(In(TERMINAL_STATUSES)) },
      select: ['id', 'dueDate', 'status'],
      order: { dueDate: 'ASC' },
      take: BATCH_SIZE,
    });

    if (deadlines.length === 0) return { updated: 0, breached: 0 };

    const now = new Date();
    const grouped = new Map<DeadlineStatus, string[]>();
    const logs: QueryDeepPartialEntity<DeadlineActivityLog>[] = [];
    let breached = 0;

    for (const deadline of deadlines) {
      const newStatus = this.computeStatus(deadline.dueDate, now);
      if (newStatus === deadline.status) continue;

      if (!grouped.has(newStatus)) grouped.set(newStatus, []);
      grouped.get(newStatus)!.push(deadline.id);

      const isBreached = deadline.status !== DeadlineStatus.OVERDUE && newStatus === DeadlineStatus.OVERDUE;
      if (isBreached) breached++;

      logs.push({
        deadlineId: deadline.id,
        action: isBreached ? DeadlineActivityAction.BREACHED : DeadlineActivityAction.STATUS_CHANGED,
        performedBy: SYSTEM_ACTOR_ID,
        description: `Status changed from ${deadline.status} to ${newStatus}`,
        metadata: { oldStatus: deadline.status, newStatus },
      });
    }

    let updated = 0;
    for (const [newStatus, ids] of grouped) {
      await repo.update({ id: In(ids) }, { status: newStatus });
      updated += ids.length;
    }

    if (logs.length > 0) {
      await logRepo.insert(logs);
    }

    this.logger.log(`[DEADLINE-STATUS] transitions complete — updated=${updated} breached=${breached}`);
    return { updated, breached };
  }
}
