import { Injectable, Logger } from '@nestjs/common';
import { ClaudeVisionService } from '../shared/claude-vision.service';
import { EplanningApiService } from '../shared/eplanning-api.service';
import { SupportingEvidenceContext, IssueResult } from '../supporting-evidence.types';
import { toIssueResult } from '../shared/issue-result.mapper';

@Injectable()
export class EnvironmentalImpactsService {
  private readonly logger = new Logger(EnvironmentalImpactsService.name);

  constructor(
    private readonly claudeVision: ClaudeVisionService,
    private readonly eplanning: EplanningApiService,
  ) {}

  async run(ctx: SupportingEvidenceContext): Promise<{ environmental_impacts: IssueResult }> {
    this.logger.log(`[ENVIRONMENTAL] Starting — ${ctx.confirmedAddress}`);
    try {
      const skill = this.claudeVision.loadSkill('se-environmental-impacts.md');
      const meta = ctx.meta;
      const { layers = [], sepp = [], warn = [] } = ctx.apiData;

      const environmentalData: Record<string, unknown> = {
        bushfire_category:
          (layers.find(l => /bushfire/i.test(l.layerName) && l.results?.length)?.results?.[0] as Record<string, string> | undefined)?.['Category'] ??
          (layers.find(l => /bushfire/i.test(l.layerName) && l.results?.length)?.results?.[0] as Record<string, string> | undefined)?.['title'] ??
          null,
        flood_layers: layers.filter(l => /flood/i.test(l.layerName) && l.results?.length).map(l => ({
          name: l.layerName,
          data: l.results[0],
        })),
        coastal_layers: layers.filter(l => /coastal|inundation|erosion/i.test(l.layerName) && l.results?.length).map(l => ({
          name: l.layerName,
          data: l.results[0],
        })),
        landslide_layers: layers.filter(l => /landslide|slope/i.test(l.layerName) && l.results?.length).map(l => l.layerName),
        contamination_layers: layers.filter(l => /contamina/i.test(l.layerName) && l.results?.length).map(l => l.layerName),
        biodiversity_layers: layers.filter(l => /biodiversity|sensitive.*land/i.test(l.layerName) && l.results?.length).map(l => l.layerName),
        acid_sulfate_class: (layers.find(l => /acid sulfate/i.test(l.layerName) && l.results?.length)?.results?.[0] as Record<string, string> | undefined)?.['Class'] ?? null,
        mine_subsidence: layers.some(l => /mine.*subsidence|subsidence/i.test(l.layerName) && l.results?.length),
        sepp_hazard_overlays: sepp.filter(s => /hazard|resilience|flood|coastal|bushfire/i.test(s.seppName)).map(s => ({
          name: s.seppName,
          maps: s.mapName || [],
        })),
        hazard_warnings: warn.map(w => w.title || w.layerRef),
      };

      const payload: Record<string, unknown> = {
        task: 'evaluate_environmental_impacts',
        property_address: ctx.confirmedAddress,
        lot: meta.lot || 'unknown',
        plan: meta.plan ? `${meta.planType}${meta.plan}` : 'unknown',
        assessed_land_value: meta.assessed_land_value || 'unknown',
        lot_area_m2: ctx.lotAreaM2,
        lga: ctx.apiData.council?.[0] || null,
        property_report_text: ctx.reportText || '',
        input_documents_text: ctx.inputDocumentsText,
        spatial_viewer_panel: this.eplanning.formatLayersAsText(ctx.apiData),
        environmental_data: environmentalData,
      };

      const images = [
        { label: 'NSW Planning Portal Spatial Viewer — environmental overlays', base64: ctx.spatialBase64 },
      ];

      const result = await this.claudeVision.callClaude(payload, images, skill, 'ENVIRONMENTAL', 5000, 2500);
      this.logger.log(`[ENVIRONMENTAL] tick: ${result['tick']} | confidence: ${result['confidence']}`);
      return { environmental_impacts: toIssueResult(result) };
    } catch (err: unknown) {
      this.logger.error(`[ENVIRONMENTAL] Fatal: ${(err as Error).message}`);
      return { environmental_impacts: { tick: false, confidence: 'MANUAL_REVIEW_REQUIRED', verification_status: 'AI_DETECTED_UNVERIFIED', trigger: null, text_box_content: null, documents_to_attach: [] } };
    }
  }
}
