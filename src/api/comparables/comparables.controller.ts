import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ComparablesService } from './comparables.service';
import { ComparablesQueueService } from './comparables-queue.service';
import { CreateComparableDto } from './dto/create-comparable.dto';
import { ComparableResponseDto } from './dto/comparable-response.dto';
import { GenerateComparableSalesDto } from './dto/generate-comparable-sales.dto';
import { EnqueueGenerateResponseDto } from './dto/enqueue-generate-response.dto';
import { JobStatusResponseDto } from './dto/job-status-response.dto';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.type';

@ApiTags('comparables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'comparables',
  version: '1',
})
export class ComparablesController {
  constructor(
    private readonly comparablesService: ComparablesService,
    private readonly comparablesQueueService: ComparablesQueueService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Add a comparable sale to a dispute case' })
  @ApiResponse({ status: 201, type: ComparableResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error or sale date is in the future' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  async create(
    @Body() dto: CreateComparableDto,
    @Request() req: { user: AuthenticatedRequest['user'] },
  ): Promise<ComparableResponseDto> {
    return this.comparablesService.create(dto.dispute_case_id, dto, req.user.id);
  }

  @Post('generate-sales')
  @HttpCode(202)
  @ApiOperation({ summary: 'Enqueue AI generation of comparable sales — poll GET /comparables/jobs/:jobId/status for progress' })
  @ApiResponse({ status: 202, type: EnqueueGenerateResponseDto })
  async generateComparableSales(
    @Body() dto: GenerateComparableSalesDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<EnqueueGenerateResponseDto> {
    return this.comparablesQueueService.enqueue(dto, req.user.id, req.correlationId);
  }

  @Get('jobs/:jobId/status')
  @ApiOperation({ summary: 'Poll the status of a comparable generation job' })
  @ApiParam({ name: 'jobId', description: 'Job ID returned by POST generate-sales' })
  @ApiResponse({ status: 200, type: JobStatusResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobStatus(@Param('jobId') jobId: string): Promise<JobStatusResponseDto> {
    return this.comparablesQueueService.getJobStatus(jobId);
  }

  @Get(':applicationId')
  @ApiOperation({ summary: 'List all comparable sales for a dispute case' })
  @ApiParam({ name: 'applicationId', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, type: [ComparableResponseDto] })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  async findByApplicationId(
    @Param('applicationId') applicationId: string,
  ): Promise<ComparableResponseDto[]> {
    return this.comparablesService.findByApplicationId(applicationId);
  }
}
