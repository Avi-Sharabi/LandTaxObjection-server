import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

import { PropertySalesArchive } from './entities/property-sales-archive.entity';
import { PropertySalesQueueService } from './property-sales-queue.service';
import { PropertySalesRetentionService, type RetentionRunResult } from './property-sales-retention.service';
import { TriggerDownloadDto } from './dto/trigger-download.dto';
import { TriggerRetentionDto } from './dto/trigger-retention.dto';
import { EnqueueResponseDto } from './dto/enqueue-response.dto';
import { DownloadJobStatusResponseDto } from './dto/download-job-status-response.dto';
import { ListArchivesQueryDto } from './dto/list-archives-query.dto';
import { PaginatedArchivesResponseDto } from './dto/archive-summary.dto';

// KAN-241: every route here is an internal/admin operation — there is no
// end-user-facing surface for this feature — so the whole controller is
// admin-only, matching the class-level guard shape already used for
// similarly internal routes elsewhere (see e.g.
// DisputeCasesController's 'internal/run-vg-follow-up').
@ApiTags('property-sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller({ path: 'property-sales', version: '1' })
export class PropertySalesController {
  constructor(
    private readonly queueService: PropertySalesQueueService,
    private readonly retentionService: PropertySalesRetentionService,
    @InjectRepository(PropertySalesArchive)
    private readonly archivesRepository: Repository<PropertySalesArchive>,
  ) {}

  @Post('downloads')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Trigger a weekly-archive download sweep',
    description:
      'Discovers every advertised weekly archive, drops the ones already held, and downloads the rest ' +
      '(oldest first, bounded by maxArchives). Runs as a BullMQ job — poll GET /downloads/:jobId/status for the result.',
  })
  @ApiResponse({ status: 202, description: 'Sweep enqueued', type: EnqueueResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 409, description: 'A sweep is already active or waiting' })
  async triggerDownload(@Body() dto: TriggerDownloadDto): Promise<EnqueueResponseDto> {
    return this.queueService.enqueueManualSweep(dto);
  }

  @Get('downloads/:jobId/status')
  @ApiOperation({ summary: 'Check a download sweep job status' })
  @ApiParam({ name: 'jobId', example: 'sweep' })
  @ApiResponse({ status: 200, type: DownloadJobStatusResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getDownloadJobStatus(@Param('jobId') jobId: string): Promise<DownloadJobStatusResponseDto> {
    return this.queueService.getJobStatus(jobId);
  }

  @Get('archives')
  @ApiOperation({ summary: 'List archive ledger rows, newest release date first' })
  @ApiResponse({ status: 200, type: PaginatedArchivesResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async listArchives(@Query() query: ListArchivesQueryDto): Promise<PaginatedArchivesResponseDto> {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;

    const [data, total] = await this.archivesRepository.findAndCount({
      where: status ? { status } : {},
      select: {
        id: true,
        source_url: true,
        archive_filename: true,
        release_date: true,
        status: true,
        size_bytes: true,
        sha256: true,
        entry_count: true,
        downloaded_at: true,
        error_code: true,
        error_message: true,
      },
      order: { release_date: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  @Post('retention/run')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Run the retention sweep immediately',
    description:
      'Reclaims disk from loaded archives past PSI_RETENTION_DAYS and orphaned staging directories. ' +
      'Runs inline (no browser, no queue) and returns the outcome directly. A `downloaded` (not yet ' +
      '`loaded`) archive is never deleted regardless of age unless PSI_RETENTION_ALLOW_UNLOADED is set.',
  })
  @ApiResponse({ status: 202, description: 'Retention run complete' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async triggerRetention(@Body() dto: TriggerRetentionDto): Promise<RetentionRunResult> {
    return this.retentionService.runRetention(dto.dryRun);
  }
}
