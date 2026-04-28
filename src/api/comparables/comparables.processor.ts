import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ComparablesService } from './comparables.service';
import { GenerateComparableSalesDto } from './dto/generate-comparable-sales.dto';

export const COMPARABLE_GENERATION_QUEUE = 'comparable-generation';

export interface ComparableGenerationJobData {
  dto: GenerateComparableSalesDto;
  createdById: string;
  serverUrl: string;
  correlationId?: string;
}

export interface ComparableGenerationJobResult {
  savedCount: number;
}

@Processor(COMPARABLE_GENERATION_QUEUE)
export class ComparablesProcessor extends WorkerHost {
  private readonly logger = new Logger(ComparablesProcessor.name);

  constructor(private readonly comparablesService: ComparablesService) {
    super();
  }

  async process(job: Job<ComparableGenerationJobData>): Promise<ComparableGenerationJobResult> {
    const { dto, createdById, serverUrl, correlationId } = job.data;
    this.logger.log(
      JSON.stringify({
        context: 'PROCESSOR.start',
        jobId: job.id,
        disputeCaseId: dto.dispute_case_id,
        ts: new Date().toISOString(),
      }),
    );

    const results = await this.comparablesService.generateComparableSales(
      dto,
      createdById,
      serverUrl,
      correlationId,
    );

    return { savedCount: results.length };
  }
}
