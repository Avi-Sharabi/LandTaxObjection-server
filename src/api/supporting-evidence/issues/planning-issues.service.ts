import { Injectable, Logger } from '@nestjs/common';
import { ClaudeVisionService } from '../shared/claude-vision.service';
import { EplanningApiService } from '../shared/eplanning-api.service';
import { SupportingEvidenceContext, IssueResult } from '../supporting-evidence.types';
import { toIssueResult } from '../shared/issue-result.mapper';

@Injectable()
export class PlanningIssuesService {
  private readonly logger = new Logger(PlanningIssuesService.name);

  constructor(
    private readonly claudeVision: ClaudeVisionService,
    private readonly eplanning: EplanningApiService,
  ) {}

  async run(ctx: SupportingEvidenceContext): Promise<{ planning_issues: IssueResult }> {
    this.logger.log(`[PLANNING] Starting — ${ctx.confirmedAddress}`);
    try {
      const skill = this.claudeVision.loadSkill('se-planning-issues.md');
      const meta = ctx.meta;
      const { layers = [] } = ctx.apiData;

      const layerMap: Record<string, Record<string, unknown>[]> = {};
      for (const layer of layers) {
        if (layer.results?.length) layerMap[layer.layerName] = layer.results as Record<string, unknown>[];
      }

      const zoneLayer = layerMap['Land Zoning Map']?.[0] as Record<string, string> | undefined;
      const zoneCode = zoneLayer?.['Zone'] || null;

      const planningData: Record<string, unknown> = {
        zone_code: zoneCode,
        zone_name: zoneLayer?.['Land Use'] || null,
        epi_name: zoneLayer?.['EPI Name'] || null,
        lot_area_m2: ctx.lotAreaM2,
        min_lot_size_m2: (layerMap['Lot Size Map']?.[0] as Record<string, unknown>)?.['Lot Size'] ?? null,
        max_height_m: (layerMap['Height of Buildings Map']?.[0] as Record<string, unknown>)?.['Maximum Building Height'] ?? null,
        fsr_from_pdf: meta.fsr_from_pdf,
        lra_layers: layers.filter(l => /land.*reservation|acquisition/i.test(l.layerName) && l.results?.length).map(l => l.layerName),
        biodiversity_layers: layers.filter(l => /biodiversity|sensitive/i.test(l.layerName) && l.results?.length).map(l => l.layerName),
        noise_layers: layers.filter(l => /noise|aircraft|anef/i.test(l.layerName) && l.results?.length).map(l => l.layerName),
        acid_sulfate_class: (layerMap['Acid Sulfate Soils Map']?.[0] as Record<string, unknown>)?.['Class'] ?? null,
        bushfire_category: (layerMap['Bushfire Prone Land (Non-EPI)']?.[0] as Record<string, unknown>)?.['Category'] ?? null,
        sepp_overlays: (ctx.apiData.sepp || []).map(s => ({ name: s.seppName, maps: s.mapName || [] })),
        hazard_warnings: (ctx.apiData.warn || []).map(w => w.title || w.layerRef),
      };

      const payload: Record<string, unknown> = {
        task: 'evaluate_planning_issues',
        property_address: ctx.confirmedAddress,
        lot: meta.lot || 'unknown',
        plan: meta.plan ? `${meta.planType}${meta.plan}` : 'unknown',
        assessed_land_value: meta.assessed_land_value || 'unknown',
        lot_area_m2: ctx.lotAreaM2,
        lga: ctx.apiData.council?.[0] || null,
        property_report_text: ctx.reportText || '',
        input_documents_text: ctx.inputDocumentsText,
        spatial_viewer_panel: this.eplanning.formatLayersAsText(ctx.apiData),
        planning_data: planningData,
      };

      const images = [
        { label: 'NSW Planning Portal Spatial Viewer — planning controls', base64: ctx.spatialBase64 },
      ];

      const result = await this.claudeVision.callClaude(payload, images, skill, 'PLANNING', 5000, 2500);
      this.logger.log(`[PLANNING] tick: ${result['tick']} | confidence: ${result['confidence']}`);
      return { planning_issues: toIssueResult(result) };
    } catch (err: unknown) {
      this.logger.error(`[PLANNING] Fatal: ${(err as Error).message}`);
      return { planning_issues: { tick: false, confidence: 'MANUAL_REVIEW_REQUIRED', trigger: null, text_box_content: null, documents_to_attach: [] } };
    }
  }
}
