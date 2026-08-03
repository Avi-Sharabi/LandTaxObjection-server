import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { PropertySalesDownloadService, type SweepOptions, type SweepResult } from './property-sales-download.service';

export const PROPERTY_SALES_DOWNLOAD_QUEUE = 'property-sales-download';

export type PropertySalesDownloadJobData = SweepOptions;

@Processor(PROPERTY_SALES_DOWNLOAD_QUEUE)
export class PropertySalesDownloadProcessor extends WorkerHost {
  private readonly logger = new Logger(PropertySalesDownloadProcessor.name);

  constructor(private readonly service: PropertySalesDownloadService) {
    super();
  }

  async process(job: Job<PropertySalesDownloadJobData>): Promise<SweepResult> {
    this.logger.log(
      JSON.stringify({
        context: 'PROCESSOR.start',
        jobId: job.id,
        data: job.data,
        ts: new Date().toISOString(),
      }),
    );

    try {
      const result = await this.service.runSweep(job.data);
      this.logger.log(
        JSON.stringify({
          context: 'PROCESSOR.done',
          jobId: job.id,
          status: result.status,
          consideredCount: result.consideredCount,
          ts: new Date().toISOString(),
        }),
      );
      return result;
    } catch (err: unknown) {
      this.logger.error(
        JSON.stringify({
          context: 'PROCESSOR.failed',
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        }),
      );
      throw err;
    }
  }
}
