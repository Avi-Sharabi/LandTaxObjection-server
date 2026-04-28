import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
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
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ComparablesService } from './comparables.service';
import { CreateComparableDto } from './dto/create-comparable.dto';
import { ComparableResponseDto } from './dto/comparable-response.dto';
import { GenerateComparableSalesDto } from './dto/generate-comparable-sales.dto';
import { EnqueueGenerateResponseDto } from './dto/enqueue-generate-response.dto';
import { JobStatusResponseDto, JobStatus } from './dto/job-status-response.dto';
import { COMPARABLE_GENERATION_QUEUE, ComparableGenerationJobData, ComparableGenerationJobResult } from './comparables.processor';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';

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
    @InjectQueue(COMPARABLE_GENERATION_QUEUE) private readonly generationQueue: Queue<ComparableGenerationJobData, ComparableGenerationJobResult>,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Add a comparable sale to a dispute case' })
  @ApiResponse({ status: 201, type: ComparableResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error or sale date is in the future' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  async create(
    @Body() dto: CreateComparableDto,
    @Request() req: { user: AuthResponseDto },
  ): Promise<ComparableResponseDto> {
    return this.comparablesService.create(dto.dispute_case_id, dto, req.user.id);
  }

  @Post('generate-sales')
  @HttpCode(202)
  @ApiOperation({ summary: 'Enqueue AI generation of comparable sales — poll GET /comparables/jobs/:jobId/status for progress' })
  @ApiResponse({ status: 202, type: EnqueueGenerateResponseDto })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  async generateComparableSales(
    @Body() dto: GenerateComparableSalesDto,
    @Request() req: { user: AuthResponseDto; protocol: string; get: (h: string) => string; correlationId?: string },
  ): Promise<EnqueueGenerateResponseDto> {
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const serverUrl = `${proto}://${req.get('host')}`;

    const job = await this.generationQueue.add('generate', {
      dto,
      createdById: req.user.id,
      serverUrl,
      correlationId: req.correlationId,
    }, { jobId: dto.dispute_case_id });

    return { jobId: job.id as string, status: 'queued' };
  }

  @Get('jobs/:jobId/status')
  @ApiOperation({ summary: 'Poll the status of a comparable generation job' })
  @ApiParam({ name: 'jobId', description: 'Job ID returned by POST generate-sales' })
  @ApiResponse({ status: 200, type: JobStatusResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobStatus(@Param('jobId') jobId: string): Promise<JobStatusResponseDto> {
    const job = await this.generationQueue.getJob(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    const state = await job.getState();
    const result = job.returnvalue as ComparableGenerationJobResult | undefined;
    const failedReason = job.failedReason;

    const statusMap: Record<string, JobStatus> = {
      waiting: 'waiting',
      active: 'active',
      completed: 'completed',
      failed: 'failed',
    };

    return {
      jobId,
      status: statusMap[state] ?? 'unknown',
      savedCount: result?.savedCount,
      error: failedReason ?? undefined,
      createdAt: job.timestamp,
      processedAt: job.processedOn ?? undefined,
      finishedAt: job.finishedOn ?? undefined,
    };
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
