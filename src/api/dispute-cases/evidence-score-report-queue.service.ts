import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  EVIDENCE_SCORE_REPORT_QUEUE,
  EvidenceScoreReportJobData,
  EvidenceScoreReportJobResult,
} from './evidence-score-report.processor';
import { EvidenceScoreReportStatusDto } from './dto/evidence-score-report-status.dto';

export type EvidenceScoreReportJobStatus =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'none';

const STATE_MAP: Record<string, EvidenceScoreReportJobStatus> = {
  waiting: 'waiting',
  active: 'active',
  completed: 'completed',
  failed: 'failed',
};

// Mirrors ANALYZE_AI_JOB_OPTIONS apart from `attempts`. One attempt only: a failed run has already
// spent up to two twenty-minute Claude calls, and retrying that three times on exponential backoff
// would burn an hour of spend on what is usually a deterministic failure (a truncated response, a
// leftover placeholder in the case data). The user is one button press from retrying deliberately.
const EVIDENCE_SCORE_REPORT_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: { age: 3 * 24 * 3600, count: 100 },
  removeOnFail: { age: 3 * 24 * 3600 },
} as const;

@Injectable()
export class EvidenceScoreReportQueueService {
  private readonly logger = new Logger(EvidenceScoreReportQueueService.name);

  constructor(
    @InjectQueue(EVIDENCE_SCORE_REPORT_QUEUE)
    private readonly queue: Queue<EvidenceScoreReportJobData, EvidenceScoreReportJobResult>,
  ) {}

  /**
   * Queues report generation for a case, returning the job id.
   *
   * `jobId: disputeCaseId` gives one job per case: a second press of Recompute while a report is still
   * building coalesces onto the running job instead of launching a second Chrome instance to race the
   * first for the same blob. A finished (or failed) job for the case is removed first so the next press
   * genuinely re-runs.
   *
   * Unlike AnalyzeAiQueueService.enqueue this never throws on a duplicate: the caller has already
   * recomputed and persisted a score, and turning that success into a 409 because a previous report is
   * still rendering would be a worse answer than silently reusing the in-flight job.
   */
  async enqueue(disputeCaseId: string): Promise<{ jobId: string; status: string }> {
    const existing = await this.queue.getJob(disputeCaseId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active' || state === 'waiting') {
        this.logger.log(
          `Evidence score report job for case ${disputeCaseId} is already ${state} — reusing it`,
        );
        return { jobId: existing.id as string, status: state };
      }
      await existing.remove();
    }

    const job = await this.queue.add(
      'generate',
      { disputeCaseId },
      { jobId: disputeCaseId, ...EVIDENCE_SCORE_REPORT_JOB_OPTIONS },
    );
    this.logger.log(`Queued evidence score report job ${job.id} for case ${disputeCaseId}`);
    return { jobId: job.id as string, status: 'queued' };
  }

  /**
   * Status of the latest report job for a case.
   *
   * Returns `none` rather than throwing when no job exists — the frontend polls this immediately after
   * a recompute and a 404 there would surface as an error toast for the normal "nothing queued yet"
   * state. That is the opposite of AnalyzeAiQueueService.getJobStatus, which 404s because its caller
   * only polls after a known enqueue.
   */
  async getJobStatus(disputeCaseId: string): Promise<EvidenceScoreReportStatusDto> {
    const job = await this.queue.getJob(disputeCaseId);
    if (!job) {
      return { dispute_case_id: disputeCaseId, job_id: null, status: 'none', error: null };
    }

    const state = await job.getState();
    return {
      dispute_case_id: disputeCaseId,
      job_id: job.id as string,
      status: STATE_MAP[state] ?? 'none',
      error: job.failedReason ?? null,
    };
  }
}
