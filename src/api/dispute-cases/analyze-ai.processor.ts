import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { PropertyContextService } from '../supporting-evidence/property-context.service';
import { ComparablesService } from '../comparables/comparables.service';
import { SupportingEvidenceService } from '../supporting-evidence/supporting-evidence.service';
import {
  InputComparable,
  SupportingEvidenceContext,
} from '../supporting-evidence/supporting-evidence.types';
import { ObjectionReasonGeneratorService } from './objection-reason-generator.service';
import { AiPropertySearchService } from './ai-property-search.service';
import {
  ValuationReportService,
  SafePlanningCtx,
  buildSafePlanningCtx,
} from './valuation-report.service';
import { ValuationCtxCacheService } from './valuation-ctx-cache.service';
import { DisputeAiSnapshot } from './entities/dispute-ai-snapshot.entity';
import { DisputeCasesService } from './dispute-cases.service';
import { parseNswAddressComponents } from 'src/common/utils/address-parser.util';

export const ANALYZE_AI_QUEUE = 'analyze-ai';

export interface AnalyzeAiJobData {
  disputeCaseId: string;
  address: string;
  userId: string;
}

export interface AnalyzeAiJobResult {
  status: 'completed';
}

@Processor(ANALYZE_AI_QUEUE, { concurrency: 1, lockDuration: 1_800_000 })
export class AnalyzeAiProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyzeAiProcessor.name);

  constructor(
    private readonly propertyContextService: PropertyContextService,
    private readonly comparablesService: ComparablesService,
    private readonly supportingEvidenceService: SupportingEvidenceService,
    private readonly objectionReasonGeneratorService: ObjectionReasonGeneratorService,
    private readonly aiPropertySearchService: AiPropertySearchService,
    private readonly valuationReportService: ValuationReportService,
    private readonly ctxCacheService: ValuationCtxCacheService,
    private readonly disputeCasesService: DisputeCasesService,
    @InjectRepository(DisputeAiSnapshot)
    private readonly snapshotRepo: Repository<DisputeAiSnapshot>,
  ) {
    super();
  }

  async process(job: Job<AnalyzeAiJobData>): Promise<AnalyzeAiJobResult> {
    const { disputeCaseId, address, userId } = job.data;
    this.logger.log(
      JSON.stringify({
        context: 'ANALYZE_AI.start',
        jobId: job.id,
        disputeCaseId,
        ts: new Date().toISOString(),
      }),
    );

    try {
      // Guard A: use pre-seeded snapshot if available (skips ePlanning/geocoding/PDF gather)
      let ctx: SupportingEvidenceContext;
      let artifactDocIds: Map<string, string> = new Map();
      const snapshot = await this.snapshotRepo.findOne({
        where: { dispute_case_id: disputeCaseId },
      });
      if (snapshot) {
        this.logger.log(
          JSON.stringify({
            context: 'ANALYZE_AI.snapshot_hit',
            jobId: job.id,
            disputeCaseId,
          }),
        );
        ctx = { ...snapshot.context, reportBuffer: null };
      } else {
        this.logger.log(
          JSON.stringify({
            context: 'ANALYZE_AI.gathering_context',
            jobId: job.id,
            disputeCaseId,
          }),
        );
        ({ ctx, artifactDocIds } = await this.propertyContextService.gather(
          disputeCaseId,
          address,
        ));
        // Cache ctx so the regenerate-valuation-report endpoint can restore planning context without re-running the pipeline
        await this.ctxCacheService.save(disputeCaseId, ctx);
        // Persist the resolved cadastre lot area so the report generator has it — previously this
        // value was resolved successfully here but discarded before ever reaching the report.
        if (ctx.lotAreaM2) {
          await this.aiPropertySearchService.persistEplanningArea(disputeCaseId, ctx.lotAreaM2);
        }
      }

      // Guard B: skip browser run if a snapshot is active (test data) OR entityEvidence already provided.
      // Snapshot cases with entityEvidence: null still must not run Puppeteer — the seeder controls
      // which grounds get evidence; browser automation would produce non-deterministic results.
      if (snapshot || ctx.entityEvidence) {
        this.logger.log(
          JSON.stringify({
            context: 'ANALYZE_AI.entity_evidence_skipped',
            jobId: job.id,
            disputeCaseId,
            reason: snapshot ? 'snapshot' : 'already_provided',
          }),
        );
      } else {
        this.logger.log(
          JSON.stringify({
            context: 'ANALYZE_AI.gathering_entity_evidence',
            jobId: job.id,
            disputeCaseId,
          }),
        );
        await this.objectionReasonGeneratorService.gatherEntityEvidence(
          disputeCaseId,
          ctx,
        );
      }

      // Area fields stripped to prevent planning-layer area data from contaminating Claude's site-area calculation
      const planningCtx: SafePlanningCtx = buildSafePlanningCtx(ctx);

      // Guard C: skip comparable generation when a snapshot is active — the snapshot's inputComparables
      // are the test's controlled inputs; letting generateComparableSales() run would merge non-deterministic
      // Claude-found sales and contaminate accuracy test results.
      if (snapshot) {
        this.logger.log(
          JSON.stringify({
            context: 'ANALYZE_AI.comparables_from_snapshot',
            jobId: job.id,
            disputeCaseId,
            count: ctx.inputComparables.length,
          }),
        );
      } else {
        this.logger.log(
          JSON.stringify({
            context: 'ANALYZE_AI.ai_property_search',
            jobId: job.id,
            disputeCaseId,
          }),
        );
        const aiPropertyDetails =
          await this.aiPropertySearchService.enrichPropertyFromWeb(
            disputeCaseId,
            address,
            ctx.lotAreaM2 ?? undefined,
          );

        this.logger.log(
          JSON.stringify({
            context: 'ANALYZE_AI.generating_comparables',
            jobId: job.id,
            disputeCaseId,
          }),
        );
        const { suburb: parsedSuburb, postcode: parsedPostcode } =
          parseNswAddressComponents(ctx.confirmedAddress);
        if (!parsedSuburb || !parsedPostcode)
          this.logger.warn(
            JSON.stringify({
              context: 'ANALYZE_AI.addr_parse_failed',
              jobId: job.id,
              confirmedAddress: ctx.confirmedAddress,
              parsedSuburb,
              parsedPostcode,
            }),
          );
        const zoningLayer = ctx.apiData.layers?.find(
          (l) => l.layerName === 'Land Zoning Map',
        );
        const zoningCode = (zoningLayer?.results?.[0]?.['Zone'] ?? null) as
          | string
          | null;
        const lotDp =
          ctx.meta.lot && ctx.meta.plan
            ? `Lot ${ctx.meta.lot} ${ctx.meta.planType} ${ctx.meta.plan}`
            : undefined;
        await this.comparablesService.generateComparableSales(
          {
            dispute_case_id: disputeCaseId,
            land_area_sqm: aiPropertyDetails?.land_area_sqm ?? undefined,
            land_area_eplanning_sqm: ctx.lotAreaM2 ?? undefined,
            suburb: parsedSuburb,
            postcode: parsedPostcode,
            zoning: zoningCode ?? undefined,
            lot_dp: lotDp,
            height_limit_m: ctx.meta.height_limit_m ?? undefined,
            lat: ctx.lat ?? undefined,
            lng: ctx.lng ?? undefined,
          },
          userId,
        );

        const dbSales =
          await this.comparablesService.findRawByDisputeCaseId(disputeCaseId);
        const mappedSales: InputComparable[] = dbSales
          .filter((s) => s.adjusted_land_value != null && s.area != null)
          .map((s) => ({
            address: [
              s.property_house_number,
              s.property_street_name,
              s.property_locality,
            ]
              .filter(Boolean)
              .join(' '),
            area_m2: s.area!,
            zone: s.zoning ?? undefined,
            analysed_land_value: s.adjusted_land_value!,
            rate_per_m2: s.adjusted_rate_per_sqm ?? undefined,
            contract_date:
              s.contract_date?.toISOString().split('T')[0] ?? undefined,
          }));
        ctx.inputComparables = [...mappedSales, ...ctx.inputComparables];
      }

      // Guard D: skip supporting-evidence analysis for snapshot/test cases — the snapshot already
      // provides pre-built evidenceResult (or null); running the full analyzeWithCtx pipeline would
      // call ePlanning, blob storage, and Claude unnecessarily and skew accuracy test results.
      if (snapshot) {
        this.logger.log(
          JSON.stringify({
            context: 'ANALYZE_AI.evidence_skipped_snapshot',
            jobId: job.id,
            disputeCaseId,
          }),
        );
      } else {
        this.logger.log(
          JSON.stringify({
            context: 'ANALYZE_AI.running_evidence',
            jobId: job.id,
            disputeCaseId,
          }),
        );
        ctx.evidenceResult =
          await this.supportingEvidenceService.analyzeWithCtx(
            disputeCaseId,
            ctx,
            artifactDocIds,
          );
      }

      this.logger.log(
        JSON.stringify({
          context: 'ANALYZE_AI.generating_objection_reasons',
          jobId: job.id,
          disputeCaseId,
        }),
      );
      await this.objectionReasonGeneratorService.generate(disputeCaseId, ctx);

      // Guard E: skip valuation report generation for snapshot/test cases — the report requires
      // full planning context from ePlanning which is not gathered when a snapshot is active.
      if (snapshot) {
        this.logger.log(
          JSON.stringify({
            context: 'ANALYZE_AI.valuation_report_skipped_snapshot',
            jobId: job.id,
            disputeCaseId,
          }),
        );
      } else {
        // Non-fatal: a PDF/Claude failure here must not fail the whole analysis job
        this.logger.log(
          JSON.stringify({
            context: 'ANALYZE_AI.generating_valuation_report',
            jobId: job.id,
            disputeCaseId,
          }),
        );
        try {
          await this.valuationReportService.generate(
            disputeCaseId,
            planningCtx,
          );
          await this.disputeCasesService.markValuated(disputeCaseId);
        } catch (reportErr: unknown) {
          this.logger.error(
            JSON.stringify({
              context: 'ANALYZE_AI.valuation_report_failed',
              jobId: job.id,
              disputeCaseId,
              error:
                reportErr instanceof Error
                  ? reportErr.message
                  : String(reportErr),
            }),
          );
        }
      }

      this.logger.log(
        JSON.stringify({
          context: 'ANALYZE_AI.complete',
          jobId: job.id,
          disputeCaseId,
          ts: new Date().toISOString(),
        }),
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
