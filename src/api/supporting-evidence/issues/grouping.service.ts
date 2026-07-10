import { Injectable, Logger } from '@nestjs/common';
import { GeocodingService } from '../shared/geocoding.service';
import { ClaudeVisionService } from '../shared/claude-vision.service';
import { EplanningApiService } from '../shared/eplanning-api.service';
import { PuppeteerService } from '../shared/puppeteer.service';
import { SupportingEvidenceContext, GroupingIssueResult } from '../supporting-evidence.types';
import { toGroupingIssueResult } from '../shared/issue-result.mapper';

@Injectable()
export class GroupingService {
  private readonly logger = new Logger(GroupingService.name);

  constructor(
    private readonly geocoding: GeocodingService,
    private readonly claudeVision: ClaudeVisionService,
    private readonly eplanning: EplanningApiService,
    private readonly puppeteer: PuppeteerService,
  ) {}

  async run(ctx: SupportingEvidenceContext): Promise<{ grouping: GroupingIssueResult; rawData: { adjacent_lots: Record<string, unknown>[] } }> {
    this.logger.log(`[GROUPING] Starting — ${ctx.confirmedAddress}`);
    try {
      const skill = this.claudeVision.loadSkill('se-grouping.md');
      const meta = ctx.meta;

      const adjacentLots = await this.geocoding.getAdjacentLots(ctx.lat, ctx.lng, 0.003)
        .catch(e => { this.logger.warn(`Adjacent lots: ${e.message}`); return []; });

      this.logger.log(`[GROUPING] Adjacent lots: ${adjacentLots.length}`);

      const aggregationPatterns = [
        /valued\s+(together|with)\s+Lot/gi,
        /included\s+in\s+assessment/gi,
        /same\s+owner/gi,
        /aggregat/gi,
      ];
      const pdfAggregationNotice = aggregationPatterns
        .flatMap(rx => [...(ctx.reportText || '').matchAll(rx)].map(m => m[0].trim()))
        .filter((v, i, arr) => arr.indexOf(v) === i);

      const closeupBase64 = ctx.closeupBase64;

      const subjectAreaM2 = ctx.lotAreaM2;
      const rankedAdjacentLots = adjacentLots
        .map(l => ({
          ...l,
          _sameDP: meta.plan && l['planlabel'] ? String(l['planlabel']).replace(/^[A-Z]+/i, '') === String(meta.plan) : false,
          _areaRatio: subjectAreaM2 && l['shape_Area'] ? (l['shape_Area'] as number) / subjectAreaM2 : null,
        }))
        .filter(l => !l._areaRatio || l._areaRatio <= 10)
        .sort((a, b) => (b._sameDP ? 1 : 0) - (a._sameDP ? 1 : 0))
        .slice(0, 20);

      const zoneLayer = ctx.apiData.layers?.find(l => l.layerName === 'Land Zoning Map' && l.results?.length);
      const zoneCode = (zoneLayer?.results?.[0] as Record<string, string> | undefined)?.['Zone'] || null;

      const groupingData: Record<string, unknown> = {
        subject_lot_plan: meta.lot && meta.plan ? `${meta.lot} ${meta.planType} ${meta.plan}` : null,
        multiple_lots_in_report: meta.multiple_lots_in_report,
        adjacent_lots: rankedAdjacentLots,
        pdf_aggregation_notice: pdfAggregationNotice,
        lot_area_m2: ctx.lotAreaM2,
        zone_code: zoneCode,
        land_tax_notice_summary: ctx.landTaxNotice
          ? { owner: (ctx.landTaxNotice as Record<string, unknown>)['owner'], properties: (ctx.landTaxNotice as Record<string, unknown>)['properties'] }
          : null,
      };

      const payload: Record<string, unknown> = {
        task: 'evaluate_grouping',
        property_address: ctx.confirmedAddress,
        lot: meta.lot,
        plan: meta.plan,
        assessed_land_value: meta.assessed_land_value,
        property_report_text: ctx.reportText,
        input_documents_text: ctx.inputDocumentsText,
        spatial_viewer_panel: this.eplanning.formatLayersAsText(ctx.apiData),
        grouping_data: groupingData,
      };

      const images = [
        { label: 'NSW Planning Portal Spatial Viewer', base64: ctx.spatialBase64 },
        { label: 'Google Maps satellite zoom 19 — physical lot configuration', base64: closeupBase64 },
      ];

      const result = await this.claudeVision.callClaude(payload, images, skill, 'GROUPING', 5000, 2500);
      this.logger.log(`[GROUPING] valued_together: ${(result['valued_together'] as Record<string, unknown>)?.['tick']} | valued_separately: ${(result['valued_separately'] as Record<string, unknown>)?.['tick']}`);
      return { grouping: toGroupingIssueResult(result), rawData: { adjacent_lots: rankedAdjacentLots } };
    } catch (err: unknown) {
      this.logger.error(`[GROUPING] Fatal: ${(err as Error).message}`);
      return {
        grouping: {
          valued_together: { tick: false, confidence: 'MANUAL_REVIEW_REQUIRED', verification_status: 'AI_DETECTED_UNVERIFIED', trigger: null, text_box_content: null, documents_to_attach: [] },
          valued_separately: { tick: false, confidence: 'MANUAL_REVIEW_REQUIRED', verification_status: 'AI_DETECTED_UNVERIFIED', trigger: null, text_box_content: null, documents_to_attach: [] },
        },
        rawData: { adjacent_lots: [] },
      };
    }
  }
}
