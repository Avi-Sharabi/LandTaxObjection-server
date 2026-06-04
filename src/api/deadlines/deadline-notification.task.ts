import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Not, In, Repository } from 'typeorm';
import { CronJob } from 'cron';
import { Deadline, DeadlineStatus } from './entities/deadline.entity';
import {
  DeadlineActivityLog,
  DeadlineActivityAction,
} from './entities/deadline-activity-log.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { TERMINAL_STATUSES, SYSTEM_ACTOR_ID } from './deadlines.constants';

const DEFAULT_CRON = '0 8 * * *';

@Injectable()
export class DeadlineNotificationTask implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeadlineNotificationTask.name);

  constructor(
    @InjectRepository(Deadline)
    private readonly deadlineRepo: Repository<Deadline>,
    @InjectRepository(DeadlineActivityLog)
    private readonly logRepo: Repository<DeadlineActivityLog>,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly dataSource: DataSource,
  ) {}

  onApplicationBootstrap(): void {
    const schedule = this.config.get<string>('DEADLINE_NOTIFICATION_CRON') || DEFAULT_CRON;
    const job = new CronJob(schedule, () => void this.runDailyNotifications());
    this.schedulerRegistry.addCronJob('deadline-notification', job);
    job.start();
    this.logger.log(`[DEADLINE-NOTIF] Scheduled with cron: "${schedule}"`);
  }

  async runDailyNotifications(): Promise<{ sent: number; failed: number }> {
    this.logger.log('[DEADLINE-NOTIF] Starting daily notification run');

    const dueSoonDays = this.config.get<number>('DEADLINE_DUE_SOON_DAYS') ?? 7;
    const atRiskDays = this.config.get<number>('DEADLINE_AT_RISK_DAYS') ?? 3;
    const rawDays = this.config.get<string>('DEADLINE_NOTIFICATION_DAYS') ?? '7,3,1';
    const thresholds = rawDays
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    let sent = 0;
    let failed = 0;

    for (const threshold of thresholds) {
      const targetStart = new Date();
      targetStart.setDate(targetStart.getDate() + threshold);
      targetStart.setHours(0, 0, 0, 0);

      const targetEnd = new Date(targetStart);
      targetEnd.setHours(23, 59, 59, 999);

      const deadlines = await this.deadlineRepo.find({
        where: {
          dueDate: Between(targetStart, targetEnd),
          status: Not(In(TERMINAL_STATUSES)),
        },
        select: ['id', 'title', 'assignedOwnerId', 'dueDate', 'status'],
      });

      const notifType = this.resolveNotificationType(threshold, dueSoonDays, atRiskDays);

      for (const deadline of deadlines) {
        try {
          // Idempotency guard — skip if already notified at this exact threshold today
          const alreadySent = await this.logRepo
            .createQueryBuilder('log')
            .where('log.deadline_id = :deadlineId', { deadlineId: deadline.id })
            .andWhere('log.action = :action', { action: DeadlineActivityAction.NOTIFICATION_SENT })
            .andWhere('log.created_at >= :startOfToday', { startOfToday })
            .andWhere("log.metadata->>'threshold' = :threshold", { threshold: String(threshold) })
            .getOne();

          if (alreadySent) {
            this.logger.log(
              `[DEADLINE-NOTIF] Skipping deadline ${deadline.id} — already notified at ${threshold}-day threshold today`,
            );
            continue;
          }

          const message = `Deadline "${deadline.title}" is due in ${threshold} day(s) on ${deadline.dueDate.toLocaleDateString()}.`;

          // Atomically persist both the notification record and the activity log so a
          // partial failure cannot leave the idempotency guard blind to a sent notification.
          const dto = await this.dataSource.transaction(async (manager) => {
            const notifDto = await this.notificationsService.createInTransaction(
              manager,
              deadline.assignedOwnerId,
              notifType,
              message,
            );

            const logRepo = manager.getRepository(DeadlineActivityLog);
            await logRepo.save(
              logRepo.create({
                deadlineId: deadline.id,
                action: DeadlineActivityAction.NOTIFICATION_SENT,
                performedBy: SYSTEM_ACTOR_ID,
                description: `Notification sent — ${threshold} day(s) before due date`,
                metadata: { threshold, notifType },
              }),
            );

            return notifDto;
          });

          // SSE push fires after DB commit — cannot be rolled back by design
          this.notificationsService.broadcast(deadline.assignedOwnerId, dto);

          sent++;
        } catch (err) {
          this.logger.error(
            `[DEADLINE-NOTIF] Failed to notify for deadline ${deadline.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
          failed++;
        }
      }
    }

    this.logger.log(`[DEADLINE-NOTIF] Complete — sent=${sent} failed=${failed}`);
    return { sent, failed };
  }

  // Pre-due thresholds only ever map to DUE_SOON or AT_RISK.
  // DEADLINE_BREACHED is reserved for the scheduler when a deadline transitions to OVERDUE.
  private resolveNotificationType(
    threshold: number,
    dueSoonDays: number,
    atRiskDays: number,
  ): NotificationType {
    if (threshold >= dueSoonDays) return NotificationType.DEADLINE_DUE_SOON;
    if (threshold >= atRiskDays) return NotificationType.DEADLINE_AT_RISK;
    return NotificationType.DEADLINE_AT_RISK; // 1-day window = max urgency, still pre-due
  }
}
