import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GenerateComparableSalesDto } from './dto/generate-comparable-sales.dto';
import { EnqueueGenerateResponseDto } from './dto/enqueue-generate-response.dto';
import { JobStatusResponseDto, JobStatus } from './dto/job-status-response.dto';
import {
  COMPARABLE_GENERATION_QUEUE,
  ComparableGenerationJobData,
  ComparableGenerationJobResult,
} from './comparables.processor';

const JOB_STATE_MAP: Record<string, JobStatus> = {
  waiting: 'waiting',
  active: 'active',
  completed: 'completed',
  failed: 'failed',
};

@Injectable()
export class ComparablesQueueService {
  constructor(
    @InjectQueue(COMPARABLE_GENERATION_QUEUE)
    private readonly queue: Queue<ComparableGenerationJobData, ComparableGenerationJobResult>,
  ) {}

  async enqueue(
    dto: GenerateComparableSalesDto,
    createdById: string,
    correlationId?: string,
  ): Promise<EnqueueGenerateResponseDto> {
    const existing = await this.queue.getJob(dto.dispute_case_id);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active' || state === 'waiting') {
        throw new ConflictException(`A generation job for this case is already ${state}`);
      }
      await existing.remove();
    }

    const job = await this.queue.add(
      'generate',
      { dto, createdById, correlationId },
      { jobId: dto.dispute_case_id },
    );
    return { jobId: job.id as string, status: 'queued' };
  }

  async getJobStatus(jobId: string): Promise<JobStatusResponseDto> {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    const state = await job.getState();
    const result = job.returnvalue as ComparableGenerationJobResult | undefined;

    return {
      jobId,
      status: JOB_STATE_MAP[state] ?? 'unknown',
      savedCount: result?.savedCount,
      error: job.failedReason ?? undefined,
      createdAt: job.timestamp,
      processedAt: job.processedOn ?? undefined,
      finishedAt: job.finishedOn ?? undefined,
    };
  }
}
