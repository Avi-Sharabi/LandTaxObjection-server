import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { AnalyzeAiJobNotFoundException } from './exceptions/analyze-ai-job-not-found.exception';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ANALYZE_AI_QUEUE, AnalyzeAiJobData, AnalyzeAiJobResult } from './analyze-ai.processor';
import { AnalyzeAiQueueItemDto } from './dto/analyze-ai-response.dto';
import { DisputeCasesService } from './dispute-cases.service';

export type AnalyzeAiJobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'unknown';

const STATE_MAP: Record<string, AnalyzeAiJobStatus> = {
  waiting: 'waiting',
  active: 'active',
  completed: 'completed',
  failed: 'failed',
};

@Injectable()
export class AnalyzeAiQueueService {
  private readonly logger = new Logger(AnalyzeAiQueueService.name);

  constructor(
    @InjectQueue(ANALYZE_AI_QUEUE)
    private readonly queue: Queue<AnalyzeAiJobData, AnalyzeAiJobResult>,
    private readonly disputeCasesService: DisputeCasesService,
  ) {}

  async enqueue(
    disputeCaseId: string,
    address: string,
    userId: string,
  ): Promise<{ jobId: string; status: string }> {
    this.logger.log(`Enqueuing analyze-ai job for case ${disputeCaseId}`);
    const existing = await this.queue.getJob(disputeCaseId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active' || state === 'waiting') {
        throw new ConflictException(`An AI analysis job for this case is already ${state}`);
      }
      await existing.remove();
    }

    const job = await this.queue.add(
      'analyze',
      { disputeCaseId, address, userId },
      {
        jobId: disputeCaseId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: { age: 3 * 24 * 3600, count: 100 },
        removeOnFail: { age: 3 * 24 * 3600 },
      },
    );
    this.logger.log(`Queued analyze-ai job ${job.id} for case ${disputeCaseId}`);
    return { jobId: job.id as string, status: 'queued' };
  }

  async getQueueSnapshot(): Promise<AnalyzeAiQueueItemDto[]> {
    const [active, waiting, completed, failed] = await Promise.all([
      this.queue.getActive(),
      this.queue.getWaiting(),
      this.queue.getCompleted(),
      this.queue.getFailed(),
    ]);

    const allJobs = [
      ...active.map(job => ({ job, status: 'active' as const })),
      ...waiting.map(job => ({ job, status: 'waiting' as const })),
      ...completed.map(job => ({ job, status: 'completed' as const })),
      ...failed.map(job => ({ job, status: 'failed' as const })),
    ];

    return Promise.all(
      allJobs.map(async ({ job, status }) => {
        const caseReference = await this.disputeCasesService.getCaseReference(job.data.disputeCaseId);
        return {
          jobId: job.id as string,
          caseId: job.data.disputeCaseId,
          caseReference,
          propertyAddress: job.data.address,
          status,
          enqueuedAt: job.timestamp,
        };
      }),
    );
  }

  async getJobStatus(disputeCaseId: string): Promise<{
    jobId: string;
    status: AnalyzeAiJobStatus;
    error?: string;
    createdAt: number;
    processedAt?: number;
    finishedAt?: number;
    allCompleted: boolean;
  }> {
    const job = await this.queue.getJob(disputeCaseId);
    if (!job) {
      this.logger.warn(`Analyze-AI job not found for case ${disputeCaseId}`);
      throw new AnalyzeAiJobNotFoundException(disputeCaseId);
    }

    const state = await job.getState();
    const status = STATE_MAP[state] ?? 'unknown';

    return {
      jobId: job.id as string,
      status,
      error: job.failedReason ?? undefined,
      createdAt: job.timestamp,
      processedAt: job.processedOn ?? undefined,
      finishedAt: job.finishedOn ?? undefined,
      allCompleted: status === 'completed',
    };
  }
}
