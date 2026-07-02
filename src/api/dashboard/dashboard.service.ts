import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../../common/redis/redis.constant';
import { DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';
import { DashboardResponseDto, DeadlineRiskCaseDto } from './dto/dashboard-response.dto';

const TERMINAL_STATUSES: DisputeStatus[] = [
  DisputeStatus.CLOSED,
  DisputeStatus.CLOSED_NO_OBJECTION,
  DisputeStatus.VG_APPROVED,
  DisputeStatus.VG_DECLINED,
];

const CACHE_KEY = 'dashboard:unified';
const CACHE_TTL_S = 300;
const DEADLINE_RISK_LIMIT = 8;

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getDashboard(isforce: boolean): Promise<DashboardResponseDto> {
    if (isforce) {
      await this.redis.del(CACHE_KEY).catch((err) =>
        this.logger.warn(`[Dashboard] Redis del failed: ${String(err)}`),
      );
    } else {
      const raw = await this.redis.get(CACHE_KEY).catch((err) => {
        this.logger.warn(`[Dashboard] Redis get failed — falling through to DB: ${String(err)}`);
        return null;
      });
      if (raw) {
        try {
          return JSON.parse(raw) as DashboardResponseDto;
        } catch {
          this.logger.warn('[Dashboard] Corrupt cache entry — falling through to DB');
        }
      }
    }

    const ph = TERMINAL_STATUSES.map((_, i) => `$${i + 1}`).join(', ');

    const [activeResults, deadlineResults, deadlineRiskCases] = await Promise.all([
      this.dataSource.query<[{ active_cases_count: number }]>(
        `SELECT COUNT(*)::int AS active_cases_count
           FROM dispute_cases
          WHERE deleted_at IS NULL
            AND status NOT IN (${ph})`,
        TERMINAL_STATUSES,
      ),
      this.dataSource.query<[{ due_this_week_count: number; overdue_count: number }]>(
        `SELECT
           COUNT(*) FILTER (WHERE (statutory_deadline::date - CURRENT_DATE) BETWEEN 0 AND 7)::int AS due_this_week_count,
           COUNT(*) FILTER (WHERE (statutory_deadline::date - CURRENT_DATE) < 0)::int             AS overdue_count
           FROM dispute_cases
          WHERE deleted_at IS NULL
            AND status NOT IN (${ph})
            AND statutory_deadline IS NOT NULL`,
        TERMINAL_STATUSES,
      ),
      this.dataSource.query<DeadlineRiskCaseDto[]>(
        `SELECT dc.id,
                dc.case_reference,
                dc.statutory_deadline,
                p.address  AS property_address,
                c.name     AS client_name
           FROM dispute_cases dc
           JOIN properties p ON dc.property_id = p.id
           JOIN clients    c ON dc.client_id   = c.id
          WHERE dc.deleted_at IS NULL
            AND dc.status NOT IN (${ph})
            AND dc.statutory_deadline IS NOT NULL
          ORDER BY dc.statutory_deadline ASC
          LIMIT ${DEADLINE_RISK_LIMIT}`,
        TERMINAL_STATUSES,
      ),
    ]).catch((err: Error) => {
      this.logger.error(`[Dashboard] DB query failed: ${String(err)}`);
      throw err;
    });

    const [activeRow] = activeResults;
    const [deadlineRow] = deadlineResults;

    const result: DashboardResponseDto = {
      status_counters: {
        active_cases_count: activeRow!.active_cases_count,
        due_this_week_count: deadlineRow!.due_this_week_count,
        overdue_count: deadlineRow!.overdue_count,
      },
      deadline_risk: deadlineRiskCases,
      recent_activities: [],
    };

    await this.redis
      .set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL_S)
      .catch((err) => this.logger.warn(`[Dashboard] Redis set failed: ${String(err)}`));

    return result;
  }
}
