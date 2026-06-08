import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { AnalyzeAiJobNotFoundException } from './exceptions/analyze-ai-job-not-found.exception';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ANALYZE_AI_QUEUE, AnalyzeAiJobData, AnalyzeAiJobResult } from './analyze-ai.processor';

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
      { jobId: disputeCaseId },
    );
    this.logger.log(`Queued analyze-ai job ${job.id} for case ${disputeCaseId}`);
    return { jobId: job.id as string, status: 'queued' };
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
