import { Injectable, Logger } from '@nestjs/common';
import { ArcgisService } from '../shared/arcgis.service';
import { ClaudeVisionService } from '../shared/claude-vision.service';
import { EplanningApiService } from '../shared/eplanning-api.service';
import { SupportingEvidenceContext, IssueResult } from '../supporting-evidence.types';
import { toIssueResult } from '../shared/issue-result.mapper';

@Injectable()
export class AccessConstraintsService {
  private readonly logger = new Logger(AccessConstraintsService.name);

  constructor(
    private readonly arcgis: ArcgisService,
    private readonly claudeVision: ClaudeVisionService,
    private readonly eplanning: EplanningApiService,
  ) {}

  async run(ctx: SupportingEvidenceContext): Promise<{ access_constraints: IssueResult; flood_data: Record<string, unknown> | null; contaminated_land: Record<string, unknown> | null }> {
    this.logger.log(`[ACCESS] Starting — ${ctx.confirmedAddress}`);
    try {
      const skill = this.claudeVision.loadSkill('se-access-constraints.md');
      const meta = ctx.meta;

      let floodData: Record<string, unknown> | null = null;
      let contaminatedData: Record<string, unknown> | null = null;

      if (ctx.lat && ctx.lng) {
        [floodData, contaminatedData] = await Promise.all([
          this.arcgis.queryFloodLayers(ctx.lat, ctx.lng).catch(e => { this.logger.warn(`Flood: ${e.message}`); return null; }),
          this.arcgis.queryContaminatedLand(ctx.lat, ctx.lng).catch(e => { this.logger.warn(`Contaminated: ${e.message}`); return null; }),
        ]);
      }

      const apiFloodData = this.arcgis.buildFloodDataFromAPI(ctx.apiData);
      const finalFloodData = floodData ? { ...floodData, eplanning_supplement: apiFloodData } : apiFloodData;

      const lotPlanStr = meta.lot ? `Lot ${meta.lot} ${meta.planType} ${meta.plan}` : '';
      const lga = ctx.apiData.council?.[0] || null;

      const payload: Record<string, unknown> = {
        task: 'evaluate_access_constraints',
        property_address: ctx.confirmedAddress,
        lot: meta.lot || 'unknown',
        plan: meta.plan ? `${meta.planType}${meta.plan}` : 'unknown',
        assessed_land_value: meta.assessed_land_value || 'unknown',
        revenue_nsw_notice_date: meta.revenue_nsw_notice_date || null,
        lot_area_m2: ctx.lotAreaM2 || null,
        lga,
        data_availability: {
          arcgis_flood: ctx.lat ? (floodData ? 'ok' : 'empty') : 'skipped',
          eplanning_flood: apiFloodData ? 'ok' : 'empty',
          arcgis_contamination: ctx.lat ? (contaminatedData ? 'ok' : 'empty') : 'skipped',
          eplanning_layers: ctx.apiData.layers?.length ? 'ok' : 'empty',
        },
        property_report_text: ctx.reportText || '',
        input_documents_text: ctx.inputDocumentsText,
        spatial_viewer_panel: this.eplanning.formatLayersAsText(ctx.apiData),
        flood_data: finalFloodData,
        contaminated_land: contaminatedData,
      };

      const images = [
        { label: 'NSW Planning Portal Spatial Viewer — zoning and lot location', base64: ctx.spatialBase64 },
        { label: 'Google Maps satellite zoom 19 — physical access, road frontage', base64: ctx.closeupBase64 },
        { label: 'Google Maps satellite zoom 15 — neighbourhood context', base64: ctx.contextBase64 },
      ];

      const result = await this.claudeVision.callClaude(payload, images, skill, 'ACCESS', 5000, 2500);
      this.logger.log(`[ACCESS] tick: ${result['tick']} | confidence: ${result['confidence']}`);

      return {
        access_constraints: toIssueResult(result),
        flood_data: finalFloodData,
        contaminated_land: contaminatedData,
      };
    } catch (err: unknown) {
      this.logger.error(`[ACCESS] Fatal: ${(err as Error).message}`);
      return {
        access_constraints: { tick: false, confidence: 'MANUAL_REVIEW_REQUIRED', verification_status: 'AI_DETECTED_UNVERIFIED', trigger: null, text_box_content: null, documents_to_attach: [] },
        flood_data: null,
        contaminated_land: null,
      };
    }
  }
}
