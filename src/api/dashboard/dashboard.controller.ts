import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
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
  @ApiOperation({
    summary: 'Unified dashboard data',
    description:
      'Returns status_counters, deadline_risk (top 10 active cases by soonest deadline), ' +
      'and recent_activities (placeholder). Cached in Redis for 5 minutes. ' +
      'Pass ?force=true to bypass the cache.',
  })
  @ApiResponse({ status: 200, description: 'Dashboard data returned successfully', type: DashboardResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthenticated — missing or expired JWT' })
  getDashboard(@Query('force') force?: string): Promise<DashboardResponseDto> {
    return this.dashboardService.getDashboard(force === 'true');
  }
}
