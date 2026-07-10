import { Injectable, Logger } from '@nestjs/common';
import { ArcgisService } from '../shared/arcgis.service';
import { ClaudeVisionService } from '../shared/claude-vision.service';
import { EplanningApiService } from '../shared/eplanning-api.service';
import { SupportingEvidenceContext, IssueResult, EplanningLayer } from '../supporting-evidence.types';
import { toIssueResult } from '../shared/issue-result.mapper';

@Injectable()
export class HeritageService {
  private readonly logger = new Logger(HeritageService.name);

  constructor(
    private readonly arcgis: ArcgisService,
    private readonly claudeVision: ClaudeVisionService,
    private readonly eplanning: EplanningApiService,
  ) {}

  async run(ctx: SupportingEvidenceContext): Promise<{ heritage: IssueResult; rawData: { heritage_arcgis_items: Record<string, unknown>[] | null; heritage_layers: EplanningLayer[] } }> {
    this.logger.log(`[HERITAGE] Starting — ${ctx.confirmedAddress}`);
    try {
      const skill = this.claudeVision.loadSkill('se-heritage.md');
      const meta = ctx.meta;

      const heritageLayerHits = ctx.apiData.layers
        .filter(l => /heritage/i.test(l.layerName) && l.results?.length)
        .map(l => ({ layerName: l.layerName, results: l.results }));

      const seppHeritage = ctx.apiData.sepp
        .filter(s => /heritage/i.test(s.seppName) || (s.mapName || []).some(m => /heritage/i.test(m)))
        .map(s => ({ seppName: s.seppName, mapName: s.mapName || [] }));

      const arcgisHeritageItems = await this.arcgis.queryHeritageItems(ctx.lat, ctx.lng)
        .catch(e => { this.logger.warn(`Heritage ArcGIS: ${e.message}`); return null; });

      const zoneLayer = ctx.apiData.layers?.find(l => l.layerName === 'Land Zoning Map' && l.results?.length);
      const zoneCode = (zoneLayer?.results?.[0] as Record<string, string> | undefined)?.['Zone'] || null;

      const heritageData: Record<string, unknown> = {
        arcgis_heritage_items: arcgisHeritageItems,
        layerintersect_heritage: heritageLayerHits,
        sepp_heritage: seppHeritage,
        pdf_heritage_mentions: meta.heritage_mentions || [],
        zone_code: zoneCode,
        council_from_api: ctx.apiData.council?.[0] || null,
      };

      this.logger.log(`[HERITAGE] arcgis: ${arcgisHeritageItems?.length ?? 0} | layers: ${heritageLayerHits.length} | sepp: ${seppHeritage.length}`);

      const payload: Record<string, unknown> = {
        task: 'evaluate_heritage',
        property_address: ctx.confirmedAddress,
        lot: meta.lot,
        plan: meta.plan,
        assessed_land_value: meta.assessed_land_value,
        revenue_nsw_notice_date: meta.revenue_nsw_notice_date,
        property_report_text: ctx.reportText,
        input_documents_text: ctx.inputDocumentsText,
        spatial_viewer_panel: this.eplanning.formatLayersAsText(ctx.apiData),
        heritage_data: heritageData,
      };

      const images = [
        { label: 'NSW Planning Portal Spatial Viewer — heritage overlays', base64: ctx.spatialBase64 },
      ];

      const result = await this.claudeVision.callClaude(payload, images, skill, 'HERITAGE', 5000, 2500);
      this.logger.log(`[HERITAGE] tick: ${result['tick']} | confidence: ${result['confidence']}`);
      return { heritage: toIssueResult(result), rawData: { heritage_arcgis_items: arcgisHeritageItems, heritage_layers: heritageLayerHits } };
    } catch (err: unknown) {
      this.logger.error(`[HERITAGE] Fatal: ${(err as Error).message}`);
      return {
        heritage: { tick: false, trigger: null, confidence: 'MANUAL_REVIEW_REQUIRED', verification_status: 'AI_DETECTED_UNVERIFIED', text_box_content: null, documents_to_attach: [], heritage_interpreted: { notes: `Error: ${(err as Error).message}` } },
        rawData: { heritage_arcgis_items: null, heritage_layers: [] },
      };
    }
  }
}
