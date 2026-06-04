import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DeadlinesService } from './deadlines.service';
import { CreateDeadlineDto } from './dto/create-deadline.dto';
import { UpdateDeadlineDto } from './dto/update-deadline.dto';
import { CancelDeadlineDto } from './dto/cancel-deadline.dto';
import { GetDeadlinesQueryDto } from './dto/get-deadlines-query.dto';
import { DeadlineResponseDto } from './dto/deadline-response.dto';
import {
  DeadlineDashboardQueryDto,
  DeadlineDashboardResponseDto,
} from './dto/deadline-dashboard.dto';

@ApiBearerAuth()
@ApiTags('deadlines')
@Controller({ path: 'deadlines', version: '1' })
@UseGuards(JwtAuthGuard)
export class DeadlinesController {
  constructor(private readonly deadlinesService: DeadlinesService) {}

  // Static routes declared first to prevent Express matching them as /:id

  @Get('dashboard')
  @ApiOperation({ summary: 'Get deadline management dashboard grouped by status column' })
  @ApiOkResponse({ type: DeadlineDashboardResponseDto })
  getDashboard(): Promise<DeadlineDashboardResponseDto> {
    return this.deadlinesService.getDashboardData();
  }

  // Parameterised routes below

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Create a deadline' })
  @ApiCreatedResponse({ type: DeadlineResponseDto })
  create(
    @Body() dto: CreateDeadlineDto,
    @Req() req: { user: { id: string } },
  ): Promise<DeadlineResponseDto> {
    return this.deadlinesService.create(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List deadlines with filters and pagination' })
  @ApiOkResponse({ description: 'Paginated list of deadlines' })
  findAll(@Query() query: GetDeadlinesQueryDto) {
    return this.deadlinesService.findPaginated(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a deadline by ID' })
  @ApiOkResponse({ type: DeadlineResponseDto })
  findOne(@Param('id') id: string): Promise<DeadlineResponseDto> {
    return this.deadlinesService.findById(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Update a deadline' })
  @ApiOkResponse({ type: DeadlineResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeadlineDto,
    @Req() req: { user: { id: string } },
  ): Promise<DeadlineResponseDto> {
    return this.deadlinesService.update(id, dto, req.user.id);
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Cancel a deadline' })
  @ApiOkResponse({ type: DeadlineResponseDto })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelDeadlineDto,
    @Req() req: { user: { id: string } },
  ): Promise<DeadlineResponseDto> {
    return this.deadlinesService.cancel(id, dto, req.user.id);
  }

  @Post(':id/complete')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Mark a deadline as completed' })
  @ApiOkResponse({ type: DeadlineResponseDto })
  complete(
    @Param('id') id: string,
    @Req() req: { user: { id: string } },
  ): Promise<DeadlineResponseDto> {
    return this.deadlinesService.complete(id, req.user.id);
  }

}
