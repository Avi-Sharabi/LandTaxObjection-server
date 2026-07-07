import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constant';
import { DashboardRepository } from './dashboard.repository';
import { DashboardResponseDto, RecentActivitiesPageDto } from './dto/dashboard-response.dto';
import { GetRecentActivitiesQueryDto } from './dto/get-recent-activities-query.dto';

const CACHE_KEY = 'dashboard:unified';
const CACHE_TTL_S = 300;

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly dashboardRepository: DashboardRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getDashboard(isForce: boolean): Promise<DashboardResponseDto> {
  if (!isForce) {
    const cached = await this.redis
      .get(CACHE_KEY)
      .then((r) => (r ? (JSON.parse(r) as DashboardResponseDto) : null))
      .catch((err: unknown) => {
        this.logger.warn(`[Dashboard] Corrupt cache entry — falling through to DB: ${String(err)}`);
        return null;
      });

    if (cached) return cached;
  }

  await this.redis
    .del(CACHE_KEY)
    .catch((err: unknown) => this.logger.warn(`[Dashboard] Redis del failed: ${String(err)}`));

  return this.fetchDataFromDB();
}

private async fetchDataFromDB(): Promise<DashboardResponseDto> {
  const [activeCasesCount, deadlineCounts, deadlineRiskCases, recentActivities] = await Promise.all([
    this.dashboardRepository.getActiveCasesCount(),
    this.dashboardRepository.getDeadlineCounts(),
    this.dashboardRepository.getDeadlineRiskCases(),
    this.dashboardRepository.getRecentActivities(),
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
    recent_activities: this.toRecentActivitiesPage(recentActivities),
  };

  await this.redis
    .set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL_S)
    .catch((err: unknown) => this.logger.warn(`[Dashboard] Redis set failed: ${String(err)}`));

  return result;
}

  async getRecentActivitiesPage(query: GetRecentActivitiesQueryDto): Promise<RecentActivitiesPageDto> {
    const recentActivities = await this.dashboardRepository.getRecentActivities({
      cursor: query.cursor,
      limit: query.limit,
    });

    return this.toRecentActivitiesPage(recentActivities);
  }

  private toRecentActivitiesPage({
    data,
    hasMore,
  }: {
    data: RecentActivitiesPageDto['data'];
    hasMore: boolean;
  }): RecentActivitiesPageDto {
    const nextCursor = hasMore ? data[data.length - 1].created_at : null;
    return { data, nextCursor, hasMore };
  }
}
