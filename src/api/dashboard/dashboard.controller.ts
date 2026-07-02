import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/entities/user.entity';
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
      'Returns status_counters, deadline_risk (top 8 active cases by soonest deadline), ' +
      'and recent_activities (placeholder). Cached in Redis for 5 minutes. ' +
      'Pass ?force=true to bypass the cache (admin only — ignored for other roles).',
  })
  @ApiResponse({ status: 200, description: 'Dashboard data returned successfully', type: DashboardResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthenticated — missing or expired JWT' })
  getDashboard(
    @Query('force') force?: string,
    @Req() req?: { user: { role: UserRole } },
  ): Promise<DashboardResponseDto> {
    const isAdmin = req?.user?.role === UserRole.ADMIN;
    return this.dashboardService.getDashboard(force === 'true' && isAdmin);
  }
}
