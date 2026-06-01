import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SupportingEvidenceService } from './supporting-evidence.service';
import { SupportingEvidenceResult } from './supporting-evidence.types';

export const SUPPORTING_EVIDENCE_QUEUE = 'supporting-evidence-generation';

export interface SupportingEvidenceJobData {
  disputeCaseId: string;
  propertyAddress: string;
}

@Processor(SUPPORTING_EVIDENCE_QUEUE)
export class SupportingEvidenceProcessor extends WorkerHost {
  private readonly logger = new Logger(SupportingEvidenceProcessor.name);

  constructor(private readonly service: SupportingEvidenceService) {
    super();
  }

  async process(job: Job<SupportingEvidenceJobData>): Promise<SupportingEvidenceResult> {
    const { disputeCaseId, propertyAddress } = job.data;
    this.logger.log(
      JSON.stringify({
        context: 'PROCESSOR.start',
        jobId: job.id,
        disputeCaseId,
        ts: new Date().toISOString(),
      }),
    );

    try {
      return await this.service.analyze(disputeCaseId, propertyAddress);
    } catch (err: unknown) {
      this.logger.error(
        JSON.stringify({
          context: 'PROCESSOR.failed',
          jobId: job.id,
          disputeCaseId,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        }),
      );
      throw err;
    }
  }
}
