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
import { StatusCountersQueryDto } from './dto/status-counters-query.dto';
import { StatusCountersResponseDto } from './dto/status-counters-response.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('status-counters')
  @ApiOperation({
    summary: 'Dashboard status counters',
    description:
      'Returns active_cases_count, due_this_week_count, and overdue_count. ' +
      'Results are cached in Redis for 60 seconds.',
  })
  @ApiResponse({ status: 200, description: 'Status counters returned successfully', type: StatusCountersResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  @ApiResponse({ status: 401, description: 'Unauthenticated — missing or expired JWT' })
  getStatusCounters(@Query() query: StatusCountersQueryDto): Promise<StatusCountersResponseDto> {
    return this.dashboardService.getStatusCounters(query);
  }
}
