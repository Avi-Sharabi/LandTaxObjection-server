import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  VG_EMAIL_ANALYSIS_QUEUE,
  VgEmailAnalysisJobData,
  VgEmailAnalysisJobResult,
} from './vg-email-analysis.queue';

const COMPLETED_JOB_TTL_SECONDS = 8 * 24 * 60 * 60; // 8 days — covers the 7-day fetch window

@Injectable()
export class VgEmailAnalysisQueueService {
  private readonly logger = new Logger(VgEmailAnalysisQueueService.name);

  constructor(
    @InjectQueue(VG_EMAIL_ANALYSIS_QUEUE)
    private readonly queue: Queue<VgEmailAnalysisJobData, VgEmailAnalysisJobResult>,
  ) {}

  async enqueue(data: VgEmailAnalysisJobData): Promise<void> {
    const jobId = data.messageId;

    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'active' || state === 'waiting') {
        this.logger.log(
          `[VG-ANALYSIS-QUEUE] Job already ${state} for messageId=${jobId} — skipping duplicate enqueue`,
        );
        return;
      }
      await existing.remove();
    }

    await this.queue.add('classify', data, {
      jobId,
      removeOnComplete: { age: COMPLETED_JOB_TTL_SECONDS },
      removeOnFail: false,
    });
    this.logger.log(`[VG-ANALYSIS-QUEUE] Enqueued messageId=${jobId}`);
  }
}
