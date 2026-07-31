import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EvidenceScoreReportService } from './evidence-score-report.service';

export const EVIDENCE_SCORE_REPORT_QUEUE = 'evidence-score-report';

export interface EvidenceScoreReportJobData {
  disputeCaseId: string;
}

export interface EvidenceScoreReportJobResult {
  status: 'completed';
}

/**
 * Generates the Evidence Score Report PDF off the request thread.
 *
 * A queue rather than an awaited call, because the generation is a multi-minute Claude call followed
 * by a Puppeteer render, and the recompute endpoint that triggers it is a plain button press: the QA
 * environment runs on Azure App Service, whose ~230-second front-end idle timeout is not configurable
 * per request, so awaiting the work would hand the client a gateway error while it continued
 * invisibly. A queue also gives coalescing (see the jobId in the queue service), a failedReason a
 * human can read, and visibility through the same tooling as the analyze-ai queue.
 *
 * concurrency 1 because each job holds a Chrome instance; a separate queue from ANALYZE_AI_QUEUE
 * because that one is also concurrency 1 and holds the entire 30-60 minute pipeline, so a report job
 * would sit behind any running analysis — and it already uses the dispute case id as its jobId, so
 * the ids would collide.
 *
 * lockDuration 60 minutes: the worst legitimate run is two Claude attempts at the service's 20-minute
 * timeoutMs, plus the render and the blob upload. A lock that expires mid-run is not a slow job, it is
 * a DUPLICATE one — BullMQ marks the job stalled and hands it to another worker.
 */
@Processor(EVIDENCE_SCORE_REPORT_QUEUE, { concurrency: 1, lockDuration: 3_600_000 })
export class EvidenceScoreReportProcessor extends WorkerHost {
  private readonly logger = new Logger(EvidenceScoreReportProcessor.name);

  constructor(private readonly evidenceScoreReportService: EvidenceScoreReportService) {
    super();
  }

  async process(job: Job<EvidenceScoreReportJobData>): Promise<EvidenceScoreReportJobResult> {
    const { disputeCaseId } = job.data;
    this.logger.log(JSON.stringify({
      context: 'EVIDENCE_SCORE_REPORT.start',
      jobId: job.id,
      disputeCaseId,
      ts: new Date().toISOString(),
    }));

    try {
      await this.evidenceScoreReportService.generate(disputeCaseId);
    } catch (err: unknown) {
      this.logger.error(JSON.stringify({
        context: 'EVIDENCE_SCORE_REPORT.failed',
        jobId: job.id,
        disputeCaseId,
        error: err instanceof Error ? err.message : String(err),
      }));
      // Rethrown deliberately, unlike the analyze-ai pipeline's non-fatal report step. This job has
      // exactly one purpose, so swallowing the error would report success for a report that does not
      // exist — and the user is one button press away from retrying. attempts is 1 (see the queue
      // service), so this surfaces as `failed` with failedReason set rather than as three more
      // twenty-minute attempts.
      throw err;
    }

    this.logger.log(JSON.stringify({
      context: 'EVIDENCE_SCORE_REPORT.complete',
      jobId: job.id,
      disputeCaseId,
      ts: new Date().toISOString(),
    }));
    return { status: 'completed' };
  }
}
