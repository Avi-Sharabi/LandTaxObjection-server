import { Controller, Get, Req, UseGuards } from '@nestjs/common';
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
import { DashboardResponseDto } from './dto/dashboard-response.dto';

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
      'and recent_activities (placeholder). Cached in Redis for 5 minutes.',
  })
  @ApiResponse({ status: 200, description: 'Dashboard data returned successfully', type: DashboardResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthenticated — missing or expired JWT' })
  getDashboard(
    @Req() req: { query: { isForce?: string } },
  ): Promise<DashboardResponseDto> {
    return this.dashboardService.getDashboard(!!req.query.isForce);
  }
}