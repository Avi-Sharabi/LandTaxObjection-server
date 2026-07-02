import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constant';
import { DashboardRepository } from './dashboard.repository';
import { DashboardResponseDto } from './dto/dashboard-response.dto';

const CACHE_KEY = 'dashboard:unified';
const CACHE_TTL_S = 300;

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly dashboardRepository: DashboardRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getDashboard(isforce: boolean): Promise<DashboardResponseDto> {
    if (isforce) {
      await this.redis
        .del(CACHE_KEY)
        .catch((err: unknown) => this.logger.warn(`[Dashboard] Redis del failed: ${String(err)}`));
    }

    const raw = isforce
      ? null
      : await this.redis.get(CACHE_KEY).catch((err: unknown) => {
          this.logger.warn(`[Dashboard] Redis get failed — falling through to DB: ${String(err)}`);
          return null;
        });

    const cached = await Promise.resolve(raw)
      .then((r) => (r ? (JSON.parse(r) as DashboardResponseDto) : null))
      .catch((err: unknown) => {
        this.logger.warn(`[Dashboard] Corrupt cache entry — falling through to DB: ${String(err)}`);
        return null;
      });

    if (cached) return cached;

    const [activeCasesCount, deadlineCounts, deadlineRiskCases] = await Promise.all([
      this.dashboardRepository.getActiveCasesCount(),
      this.dashboardRepository.getDeadlineCounts(),
      this.dashboardRepository.getDeadlineRiskCases(),
    ]).catch((err: unknown) => {
      this.logger.error(`[Dashboard] DB query failed: ${String(err)}`);
      throw err;
    });

    const result: DashboardResponseDto = {
      status_counters: {
        active_cases_count: activeCasesCount,
        due_this_week_count: deadlineCounts.due_this_week_count,
        overdue_count: deadlineCounts.overdue_count,
      },
      deadline_risk: deadlineRiskCases,
      recent_activities: [],
    };

    await this.redis
      .set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL_S)
      .catch((err: unknown) => this.logger.warn(`[Dashboard] Redis set failed: ${String(err)}`));

    return result;
  }
}
