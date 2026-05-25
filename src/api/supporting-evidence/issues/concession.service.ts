import { Injectable, Logger } from '@nestjs/common';
import { ClaudeVisionService } from '../shared/claude-vision.service';
import { EplanningApiService } from '../shared/eplanning-api.service';
import { PuppeteerService } from '../shared/puppeteer.service';
import { SupportingEvidenceContext, IssueResult } from '../supporting-evidence.types';
import { toIssueResult } from '../shared/issue-result.mapper';

@Injectable()
export class ConcessionService {
  private readonly logger = new Logger(ConcessionService.name);

  constructor(
    private readonly claudeVision: ClaudeVisionService,
    private readonly eplanning: EplanningApiService,
    private readonly puppeteer: PuppeteerService,
  ) {}

  async run(
    ctx: SupportingEvidenceContext,
    priorResults: {
      issue1: { flood_data?: Record<string, unknown> | null; contaminated_land?: Record<string, unknown> | null } | null;
      issue3: { environmental_impacts?: Record<string, unknown> } | null;
    },
  ): Promise<IssueResult> {
    this.logger.log(`[CONCESSION] Starting — ${ctx.confirmedAddress}`);
    try {
      const skill = this.claudeVision.loadSkill('se-concession.md');
      const meta = ctx.meta;

      const zoneLayer = ctx.apiData.layers?.find(l => l.layerName === 'Land Zoning Map' && l.results?.length);
      const zoneCode = (zoneLayer?.results?.[0] as Record<string, string> | undefined)?.['Zone'] || null;
      const zoneName = (zoneLayer?.results?.[0] as Record<string, string> | undefined)?.['Land Use'] || null;

      const strataLot = meta.planType === 'SP';
      const multipleLots = meta.multiple_lots_in_report.length > 1;

      const seppOverlays = (ctx.apiData.sepp || []).map(s => ({
        name: s.seppName,
        mapNames: s.mapName || [],
      }));

      const satBase64 = ctx.contextBase64;

      const priorConstraints: Record<string, unknown> = {
        flood_confirmed: priorResults?.issue1?.flood_data ? true : false,
        flood_zone: (priorResults?.issue1?.flood_data as Record<string, unknown> | null)?.['zone_name'] || null,
        contamination_status: (priorResults?.issue1?.contaminated_land as Record<string, unknown> | null)?.['_status'] || null,
        contamination_attributes: priorResults?.issue1?.contaminated_land || null,
        bushfire_category: (priorResults?.issue3?.environmental_impacts as Record<string, unknown> | null)?.['bushfire_category'] || null,
      };

      const concessionData: Record<string, unknown> = {
        zone_code: zoneCode,
        zone_name: zoneName,
        lot_area_m2: ctx.lotAreaM2,
        plan_type: meta.planType,
        concession_mentions_in_pdf: meta.concession_mentions,
        sepp_overlays: seppOverlays,
        strata_lot: strataLot,
        multiple_lots: multipleLots,
        prior_constraint_findings: priorConstraints,
      };

      this.logger.log(`[CONCESSION] zone: ${zoneCode} | strata: ${strataLot} | concession mentions: ${meta.concession_mentions.length}`);

      const payload: Record<string, unknown> = {
        task: 'evaluate_concession',
        property_address: ctx.confirmedAddress,
        lot: meta.lot,
        plan: meta.plan,
        assessed_land_value: meta.assessed_land_value,
        property_report_text: ctx.reportText,
        input_documents_text: ctx.inputDocumentsText,
        spatial_viewer_panel: this.eplanning.formatLayersAsText(ctx.apiData),
        concession_data: concessionData,
      };

      const images = [
        { label: 'Google Maps satellite zoom 15 — neighbourhood context', base64: satBase64 },
      ];

      const result = await this.claudeVision.callClaude(payload, images, skill, 'CONCESSION', 5000, 2500);
      this.logger.log(`[CONCESSION] tick: ${result['tick']} | confidence: ${result['confidence']}`);
      return toIssueResult(result);
    } catch (err: unknown) {
      this.logger.error(`[CONCESSION] Fatal: ${(err as Error).message}`);
      return { tick: false, confidence: 'MANUAL_REVIEW_REQUIRED', trigger: null, text_box_content: null, documents_to_attach: [] };
    }
  }
}
