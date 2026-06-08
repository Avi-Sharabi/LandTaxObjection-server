import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DashboardService } from './dashboard.service';
import { StatusCountersResponseDto } from './dto/status-counters-response.dto';
import { DeadlineRiskLevel, GetDeadlineRiskQueryDto } from './dto/deadline-risk-query.dto';
import { DeadlineRiskResponseDto } from './dto/deadline-risk-response.dto';

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

  @Get('deadline-risk')
  @ApiOperation({
    summary: 'List cases at risk of missing upcoming statutory deadlines',
    description:
      'Returns all non-closed dispute cases grouped by deadline risk level. ' +
      'Pass riskLevel as a query param to filter to a single tier (safe | due_soon | at_risk | overdue). ' +
      'Omit riskLevel to return all cases. Results are ordered by statutory_deadline ASC — ' +
      'overdue cases first, then nearest upcoming. ' +
      'Thresholds: DEADLINE_RISK_AT_RISK_DAYS (default 7d), DEADLINE_RISK_DUE_SOON_DAYS (default 14d).',
  })
  @ApiQuery({ name: 'riskLevel', enum: DeadlineRiskLevel, required: false, description: 'Narrow to a specific risk tier only' })
  @ApiResponse({
    status: 200,
    type: DeadlineRiskResponseDto,
    description: 'Cases ordered by urgency (overdue first, then nearest deadline). risk_level values: overdue | at_risk | due_soon | safe',
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  @ApiResponse({ status: 401, description: 'Unauthenticated — JWT missing or expired' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  getDeadlineRisk(@Query() query: GetDeadlineRiskQueryDto): Promise<DeadlineRiskResponseDto> {
    return this.dashboardService.getDeadlineRisk(query);
  }

}
