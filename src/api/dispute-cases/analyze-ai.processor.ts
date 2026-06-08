import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PropertyContextService } from '../supporting-evidence/property-context.service';
import { ComparablesService } from '../comparables/comparables.service';
import { SupportingEvidenceService } from '../supporting-evidence/supporting-evidence.service';
import { InputComparable } from '../supporting-evidence/supporting-evidence.types';
import { ObjectionReasonGeneratorService } from './objection-reason-generator.service';

export const ANALYZE_AI_QUEUE = 'analyze-ai';

export interface AnalyzeAiJobData {
  disputeCaseId: string;
  address: string;
  userId: string;
}

export interface AnalyzeAiJobResult {
  status: 'completed';
}

@Processor(ANALYZE_AI_QUEUE)
export class AnalyzeAiProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyzeAiProcessor.name);

  constructor(
    private readonly propertyContextService: PropertyContextService,
    private readonly comparablesService: ComparablesService,
    private readonly supportingEvidenceService: SupportingEvidenceService,
    private readonly objectionReasonGeneratorService: ObjectionReasonGeneratorService,
  ) {
    super();
  }

  async process(job: Job<AnalyzeAiJobData>): Promise<AnalyzeAiJobResult> {
    const { disputeCaseId, address, userId } = job.data;
    this.logger.log(
      JSON.stringify({ context: 'ANALYZE_AI.start', jobId: job.id, disputeCaseId, ts: new Date().toISOString() }),
    );

    try {
      // Step 1: Gather property context — saves screenshots + property report to assessment documents
      this.logger.log(JSON.stringify({ context: 'ANALYZE_AI.gathering_context', jobId: job.id, disputeCaseId }));
      const { ctx, artifactDocIds } = await this.propertyContextService.gather(disputeCaseId, address);

      // Step 1b: Entity navigation (ABR/ASIC) — runs now so entity facts are in ctx for all downstream steps
      this.logger.log(JSON.stringify({ context: 'ANALYZE_AI.gathering_entity_evidence', jobId: job.id, disputeCaseId }));
      await this.objectionReasonGeneratorService.gatherEntityEvidence(disputeCaseId, ctx);

      // Step 2: Generate comparable sales — enrich DTO with ePlanning-confirmed address fields
      // so the prefetch finds real candidates even when the property entity lacks suburb/postcode.
      this.logger.log(JSON.stringify({ context: 'ANALYZE_AI.generating_comparables', jobId: job.id, disputeCaseId }));
      const addrMatch = ctx.confirmedAddress.match(/^.+\s+([A-Z][A-Z\s]+)\s+(\d{4})\s*$/i);
      const zoningLayer = ctx.apiData.layers?.find(l => l.layerName === 'Land Zoning Map');
      const zoningCode = (zoningLayer?.results?.[0]?.['Zone'] ?? null) as string | null;
      const lotDp =
        ctx.meta.lot && ctx.meta.plan
          ? `Lot ${ctx.meta.lot} ${ctx.meta.planType} ${ctx.meta.plan}`
          : undefined;
      await this.comparablesService.generateComparableSales(
        {
          dispute_case_id: disputeCaseId,
          land_area_sqm: ctx.lotAreaM2 ?? undefined,
          suburb: addrMatch?.[1]?.trim().toUpperCase() ?? undefined,
          postcode: addrMatch?.[2] ?? undefined,
          zoning: zoningCode ?? undefined,
          lot_dp: lotDp,
          height_limit_m: ctx.meta.height_limit_m ?? undefined,
        },
        userId,
      );

      // Merge DB comparables + PDF-extracted comparables into context
      const dbSales = await this.comparablesService.findRawByDisputeCaseId(disputeCaseId);
      const mappedSales: InputComparable[] = dbSales
        .filter(s => s.adjusted_land_value != null && s.area != null)
        .map(s => ({
          address: [s.property_house_number, s.property_street_name, s.property_locality]
            .filter(Boolean)
            .join(' '),
          area_m2: s.area!,
          zone: s.zoning ?? undefined,
          analysed_land_value: s.adjusted_land_value!,
          rate_per_m2: s.adjusted_rate_per_sqm ?? undefined,
          contract_date: s.contract_date?.toISOString().split('T')[0] ?? undefined,
        }));
      ctx.inputComparables = [...mappedSales, ...ctx.inputComparables];

      // Step 4: Run supporting evidence using pre-built context (no re-gathering)
      this.logger.log(JSON.stringify({ context: 'ANALYZE_AI.running_evidence', jobId: job.id, disputeCaseId }));
      ctx.evidenceResult = await this.supportingEvidenceService.analyzeWithCtx(disputeCaseId, ctx, artifactDocIds);

      // Step 5: Generate objection reasons — passes all prior pipeline outputs as context
      this.logger.log(JSON.stringify({ context: 'ANALYZE_AI.generating_objection_reasons', jobId: job.id, disputeCaseId }));
      await this.objectionReasonGeneratorService.generate(disputeCaseId, ctx);

      this.logger.log(
        JSON.stringify({ context: 'ANALYZE_AI.complete', jobId: job.id, disputeCaseId, ts: new Date().toISOString() }),
      );
      return { status: 'completed' };
    } catch (err: unknown) {
      this.logger.error(
        JSON.stringify({
          context: 'ANALYZE_AI.failed',
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
