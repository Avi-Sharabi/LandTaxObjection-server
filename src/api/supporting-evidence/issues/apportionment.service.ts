import { Injectable, Logger } from '@nestjs/common';
import { ArcgisService } from '../shared/arcgis.service';
import { ClaudeVisionService } from '../shared/claude-vision.service';
import { EplanningApiService } from '../shared/eplanning-api.service';
import { SupportingEvidenceContext, IssueResult } from '../supporting-evidence.types';
import { toIssueResult } from '../shared/issue-result.mapper';

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

@Injectable()
export class ApportionmentService {
  private readonly logger = new Logger(ApportionmentService.name);

  constructor(
    private readonly arcgis: ArcgisService,
    private readonly claudeVision: ClaudeVisionService,
    private readonly eplanning: EplanningApiService,
  ) {}

  async run(ctx: SupportingEvidenceContext): Promise<{ apportionment: IssueResult; rawData: { vg_comparables: Record<string, unknown>[] } }> {
    this.logger.log(`[APPORT] Starting — ${ctx.confirmedAddress}`);
    try {
      const skill = this.claudeVision.loadSkill('se-apportionment.md');
      const meta = ctx.meta;

      let allComps = await this.arcgis.queryVGLandValues(ctx.lat, ctx.lng, 0.005);
      if (allComps.length < 3) {
        this.logger.log('[APPORT] Expanding to 0.01 deg');
        allComps = await this.arcgis.queryVGLandValues(ctx.lat, ctx.lng, 0.010);
      }
      if (allComps.length < 3) {
        this.logger.log('[APPORT] Expanding to 0.02 deg');
        allComps = await this.arcgis.queryVGLandValues(ctx.lat, ctx.lng, 0.020);
      }

      const zoneLayer = ctx.apiData.layers?.find(l => l.layerName === 'Land Zoning Map' && l.results?.length);
      const subjectZone = (zoneLayer?.results?.[0] as Record<string, string> | undefined)?.['Zone'] || null;

      const arcgisComps = allComps
        .filter(c => c['propid'] !== ctx.propId && (c['area'] as number) > 0 && (c['lv'] as number) > 0)
        .map(c => ({
          lot_plan: c['address'] || c['propid'],
          area_m2: Math.round(c['area'] as number),
          assessed_value: Math.round(c['lv'] as number),
          value_per_m2: Math.round((c['lv'] as number) / (c['area'] as number)),
          zone: c['zone'],
          source: 'vg_arcgis',
        }));

      const inputComps = (ctx.inputComparables || []).map(c => ({
        lot_plan: c.address,
        area_m2: c.area_m2,
        assessed_value: c.analysed_land_value,
        value_per_m2: c.rate_per_m2 || (c.area_m2 && c.analysed_land_value != null ? Math.round(c.analysed_land_value / c.area_m2) : null),
        zone: c.zone,
        source: 'input_document',
      })).filter(c => c.area_m2 && c.assessed_value);

      const arcgisAddresses = new Set(arcgisComps.map(c => String(c.lot_plan || '').toLowerCase()));
      const supplementComps = inputComps.filter(c => !arcgisAddresses.has(String(c.lot_plan || '').toLowerCase()));

      const allCompsForMedian = [...arcgisComps, ...(arcgisComps.length < 5 ? supplementComps : [])];
      const ratesArr = allCompsForMedian.map(c => c.value_per_m2 as number).filter(r => r && r > 0);
      const medianRate = median(ratesArr);
      const subjectRatePerM2 = meta.assessed_land_value && ctx.lotAreaM2
        ? Math.round(meta.assessed_land_value / ctx.lotAreaM2)
        : null;
      const deviationPct = medianRate && subjectRatePerM2
        ? Math.round(((subjectRatePerM2 - medianRate) / medianRate) * 100)
        : null;

      const reportedAreaMatch =
        (ctx.reportText || '').match(/[Aa]rea[:\s]+(\d[\d,.]+)\s*(?:m²|m2|square\s+metres?)/i) ||
        (ctx.reportText || '').match(/(\d[\d,.]+)\s*(?:m²|m2|square\s+metres?)\s+(?:in\s+area|area)/i);
      const pdfAreaM2 = reportedAreaMatch ? parseFloat(reportedAreaMatch[1].replace(/,/g, '')) : null;
      const lotAreaDiscrepancyPct = ctx.lotAreaM2 && pdfAreaM2
        ? Math.round(Math.abs((pdfAreaM2 - ctx.lotAreaM2) / ctx.lotAreaM2) * 100)
        : null;

      this.logger.log(`[APPORT] Subject $/m²: ${subjectRatePerM2} | Median: ${medianRate} | Deviation: ${deviationPct}% | Area discrepancy: ${lotAreaDiscrepancyPct}%`);

      const apportionmentData: Record<string, unknown> = {
        subject_area_m2: ctx.lotAreaM2,
        assessed_value: meta.assessed_land_value,
        subject_value_per_m2: subjectRatePerM2,
        subject_zone_code: subjectZone,
        arcgis_comparables: arcgisComps.slice(0, 25),
        input_comparables: supplementComps.slice(0, 15),
        comparable_zone_median_per_m2: medianRate,
        comparable_count: allCompsForMedian.length,
        deviation_pct: deviationPct,
        lot_area_discrepancy_pct: lotAreaDiscrepancyPct,
        pdf_area_m2: pdfAreaM2,
        cadastre_area_m2: ctx.lotAreaM2,
        multiple_lots_in_report: meta.multiple_lots_in_report.length > 1,
      };

      const payload: Record<string, unknown> = {
        task: 'evaluate_apportionment',
        property_address: ctx.confirmedAddress,
        lot: meta.lot,
        plan: meta.plan,
        assessed_land_value: meta.assessed_land_value,
        revenue_nsw_notice_date: meta.revenue_nsw_notice_date,
        property_report_text: ctx.reportText,
        input_documents_text: ctx.inputDocumentsText,
        spatial_viewer_panel: this.eplanning.formatLayersAsText(ctx.apiData),
        apportionment_data: apportionmentData,
      };

      const images = [
        { label: 'NSW Planning Portal Spatial Viewer', base64: ctx.spatialBase64 },
        { label: 'Google Maps satellite zoom 19', base64: ctx.closeupBase64 },
      ];

      const result = await this.claudeVision.callClaude(payload, images, skill, 'APPORT', 5000, 2500);
      this.logger.log(`[APPORT] tick: ${result['tick']} | confidence: ${result['confidence']}`);
      return { apportionment: toIssueResult(result), rawData: { vg_comparables: arcgisComps.slice(0, 25) } };
    } catch (err: unknown) {
      this.logger.error(`[APPORT] Fatal: ${(err as Error).message}`);
      return { apportionment: { tick: false, confidence: 'MANUAL_REVIEW_REQUIRED', verification_status: 'AI_DETECTED_UNVERIFIED', trigger: null, text_box_content: null, documents_to_attach: [] }, rawData: { vg_comparables: [] } };
    }
  }
}
