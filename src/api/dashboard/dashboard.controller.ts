import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DashboardService } from './dashboard.service';
import { StatusCountersResponseDto } from './dto/status-counters-response.dto';

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
}
