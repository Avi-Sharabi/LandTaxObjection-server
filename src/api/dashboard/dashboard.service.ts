import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';

const TERMINAL_STATUSES: DisputeStatus[] = [
  DisputeStatus.CLOSED,
  DisputeStatus.CLOSED_NO_OBJECTION,
  DisputeStatus.VG_APPROVED,
  DisputeStatus.VG_DECLINED,
];
import { REDIS_CLIENT } from '../../common/redis/redis.constant';
import { StatusCountersQueryDto } from './dto/status-counters-query.dto';
import { StatusCountersResponseDto } from './dto/status-counters-response.dto';

const CACHE_TTL_S = 300; // 5 minutes — matches frontend polling interval
const CACHE_KEY_PREFIX = 'dashboard:status-counters';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getStatusCounters(query: StatusCountersQueryDto): Promise<StatusCountersResponseDto> {
    const cacheKey = this.buildCacheKey(query);

    if (query.force) {
      try {
        await this.redis.del(cacheKey);
      } catch (err) {
        this.logger.warn(`[Dashboard] Redis del failed: ${String(err)}`);
      }
    } else {
      try {
        const raw = await this.redis.get(cacheKey);
        if (raw) return JSON.parse(raw) as StatusCountersResponseDto;
      } catch (err) {
        this.logger.warn(`[Dashboard] Redis get failed — falling through to DB: ${String(err)}`);
      }
    }

    const ph = TERMINAL_STATUSES.map((_, i) => `$${i + 1}`).join(', ');

    const [[activeRow], [deadlineRow]] = await Promise.all([
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
    ]);

    const result: StatusCountersResponseDto = {
      active_cases_count: activeRow.active_cases_count,
      due_this_week_count: deadlineRow.due_this_week_count,
      overdue_count: deadlineRow.overdue_count,
    };

    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_S);
    } catch (err) {
      this.logger.warn(`[Dashboard] Redis set failed: ${String(err)}`);
    }

    return result;
  }

  private buildCacheKey(q: StatusCountersQueryDto): string {
    return [
      CACHE_KEY_PREFIX,
      `dateFrom:${q.dateFrom ?? ''}`,
      `dateTo:${q.dateTo ?? ''}`,
    ].join('|');
  }
}
