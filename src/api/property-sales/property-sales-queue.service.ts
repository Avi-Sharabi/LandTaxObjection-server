import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import {
  PROPERTY_SALES_DOWNLOAD_QUEUE,
  type PropertySalesDownloadJobData,
} from './property-sales-download.processor';
import type { SweepResult } from './property-sales-download.service';

export type PropertySalesJobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'unknown';

const STATE_MAP: Record<string, PropertySalesJobStatus> = {
  waiting: 'waiting',
  active: 'active',
  completed: 'completed',
  failed: 'failed',
};

export interface EnqueueResult {
  readonly jobId: string;
  readonly status: 'queued';
}

export interface JobStatusResult {
  readonly jobId: string;
  readonly status: PropertySalesJobStatus;
  readonly result?: SweepResult;
  readonly error?: string;
  readonly createdAt: number;
  readonly processedAt?: number;
  readonly finishedAt?: number;
}

@Injectable()
export class PropertySalesQueueService {
  constructor(
    @InjectQueue(PROPERTY_SALES_DOWNLOAD_QUEUE)
    private readonly queue: Queue<PropertySalesDownloadJobData, SweepResult>,
  ) {}

  /** The cron tick always uses this same jobId — a second tick while one is active/waiting throws ConflictException, which the cron task treats as "skip, not an error". */
  async enqueueScheduledSweep(): Promise<EnqueueResult> {
    return this.enqueue('sweep', {});
  }

  /**
   * A manual trigger gets its own minute-scoped id, distinct from the cron's
   * `sweep`, so an operator can still force a run even while a scheduled
   * sweep's completed/failed job record is still retained in the queue
   * (BullMQ's `removeOnComplete`/`removeOnFail`). If a sweep — scheduled or
   * manual — is genuinely ACTIVE at the same moment, the service's own
   * advisory lock (not this queue-level check) is what makes the second one
   * resolve as `skipped_concurrent` rather than racing the first.
   */
  async enqueueManualSweep(data: PropertySalesDownloadJobData): Promise<EnqueueResult> {
    // No colons: BullMQ rejects a custom jobId containing ':' unless it
    // splits into exactly 3 parts (a compat shim for repeatable-job ids
    // unrelated to this use case) — verified directly, see PR notes.
    const minuteStamp = new Date().toISOString().slice(0, 16).replace(/[:]/g, '-');
    const jobId = `sweep-manual-${minuteStamp}`;
    return this.enqueue(jobId, data);
  }

  private async enqueue(jobId: string, data: PropertySalesDownloadJobData): Promise<EnqueueResult> {
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active' || state === 'waiting') {
        throw new ConflictException(`A property-sales download sweep (${jobId}) is already ${state}`);
      }
      await existing.remove();
    }

    const job = await this.queue.add('sweep', data, { jobId });
    return { jobId: job.id as string, status: 'queued' };
  }

  async getJobStatus(jobId: string): Promise<JobStatusResult> {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    const state = await job.getState();
    const status = STATE_MAP[state] ?? 'unknown';

    return {
      jobId,
      status,
      result: status === 'completed' ? job.returnvalue : undefined,
      error: job.failedReason ?? undefined,
      createdAt: job.timestamp,
      processedAt: job.processedOn ?? undefined,
      finishedAt: job.finishedOn ?? undefined,
    };
  }
}
