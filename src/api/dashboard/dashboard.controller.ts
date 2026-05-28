import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DashboardService } from './dashboard.service';
import { StatusCountersResponseDto } from './dto/status-counters-response.dto';
import { GetDeadlineRiskBodyDto } from './dto/deadline-risk-query.dto';
import { DeadlineRiskResponseDto } from './dto/deadline-risk-response.dto';
import { GetRecentActivitiesQueryDto } from './dto/get-recent-activities-query.dto';
import { RecentActivitiesResponseDto } from './dto/recent-activities-response.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.INTERNAL_Assessor)
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('status-counters')
  @ApiOperation({ summary: 'Get dispute case counts grouped by status for the dashboard' })
  @ApiResponse({ status: 200, type: StatusCountersResponseDto, description: 'Counts for all dispute statuses' })
  @ApiResponse({ status: 401, description: 'Unauthenticated — JWT cookie missing or expired' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  getStatusCounters(): Promise<StatusCountersResponseDto> {
    return this.dashboardService.getStatusCounters();
  }

  @Post('deadline-risk')
  @ApiOperation({
    summary: 'List cases at risk of missing upcoming statutory deadlines',
    description:
      'Returns all non-closed dispute cases grouped by deadline risk level. ' +
      'Pass riskLevel in the body to filter to a single column (safe | due_soon | at_risk | overdue). ' +
      'Omit riskLevel to return all cases. Results are ordered by statutory_deadline ASC — ' +
      'overdue cases first, then nearest upcoming. ' +
      'Thresholds: DEADLINE_RISK_AT_RISK_DAYS (default 7d), DEADLINE_RISK_DUE_SOON_DAYS (default 14d).',
  })
  @ApiBody({
    type: GetDeadlineRiskBodyDto,
    description: 'All fields are optional. Send {} to return all active cases.',
    examples: {
      all_cases: {
        summary: 'All active cases (no filter)',
        value: {},
      },
      overdue: {
        summary: 'Urgent / Overdue column',
        value: { riskLevel: 'overdue' },
      },
      at_risk: {
        summary: 'Urgent / Overdue column (within 7 days)',
        value: { riskLevel: 'at_risk' },
      },
      due_soon: {
        summary: 'Approaching column (within 14 days)',
        value: { riskLevel: 'due_soon' },
      },
      safe: {
        summary: 'Safe column (beyond 14 days)',
        value: { riskLevel: 'safe' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    type: DeadlineRiskResponseDto,
    description: 'Cases ordered by urgency (overdue first, then nearest deadline). risk_level values: overdue | at_risk | due_soon | safe',
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthenticated — JWT missing or expired' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  getDeadlineRisk(@Body() body: GetDeadlineRiskBodyDto): Promise<DeadlineRiskResponseDto> {
    return this.dashboardService.getDeadlineRisk(body);
  }

  @Post('recent-activities')
  @ApiOperation({ summary: 'Get paginated recent audit log activities for the dashboard feed' })
  @ApiBody({ type: GetRecentActivitiesQueryDto, description: 'All fields are optional. Send {} for first page with defaults.' })
  @ApiResponse({ status: 200, type: RecentActivitiesResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthenticated — JWT missing or expired' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  getRecentActivities(@Body() body: GetRecentActivitiesQueryDto): Promise<RecentActivitiesResponseDto> {
    return this.dashboardService.getRecentActivities(body);
  }
}
