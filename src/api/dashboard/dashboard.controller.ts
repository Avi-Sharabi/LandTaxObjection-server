import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { DashboardResponseDto, RecentActivitiesPageDto } from './dto/dashboard-response.dto';
import { GetRecentActivitiesQueryDto } from './dto/get-recent-activities-query.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiQuery({ name: 'isForce', type: Boolean, required: false, nullable: true, description: 'Admin only — pass true to bypass the Redis cache.' })
  @ApiOperation({
    summary: 'Unified dashboard data',
    description:
      'Returns status_counters, deadline_risk (top 8 active cases by soonest deadline), ' +
      'and recent_activities (first page of 15 audit-log events, newest first — see ' +
      'GET /dashboard/recent-activities for subsequent pages). Cached in Redis for 5 minutes.',
  })
  @ApiResponse({ status: 200, description: 'Dashboard data returned successfully', type: DashboardResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthenticated — missing or expired JWT' })
  getDashboard(
    @Req() req: { query: { isForce?: string } },
  ): Promise<DashboardResponseDto> {
    return this.dashboardService.getDashboard(!!req.query.isForce);
  }

  @Get('recent-activities')
  @ApiOperation({
    summary: 'Paginated recent activity feed for infinite scroll',
    description:
      'Cursor-paginated audit-log events, newest first. Pass `cursor` (nextCursor from the ' +
      'previous page) to fetch older activity. Not cached — always reads live from the database.',
  })
  @ApiResponse({ status: 200, description: 'Recent activities page returned successfully', type: RecentActivitiesPageDto })
  @ApiResponse({ status: 401, description: 'Unauthenticated — missing or expired JWT' })
  getRecentActivities(@Query() query: GetRecentActivitiesQueryDto): Promise<RecentActivitiesPageDto> {
    return this.dashboardService.getRecentActivitiesPage(query);
  }
}