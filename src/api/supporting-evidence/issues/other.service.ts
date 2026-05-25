import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ArcgisService } from '../shared/arcgis.service';
import { ClaudeVisionService } from '../shared/claude-vision.service';
import { EplanningApiService } from '../shared/eplanning-api.service';
import { SupportingEvidenceContext, IssueResult, EplanningApiData } from '../supporting-evidence.types';
import { toIssueResult } from '../shared/issue-result.mapper';

@Injectable()
export class OtherService {
  private readonly logger = new Logger(OtherService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(
    private readonly arcgis: ArcgisService,
    private readonly claudeVision: ClaudeVisionService,
    private readonly eplanning: EplanningApiService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.apiUrl = this.config.getOrThrow<string>('ANTHROPIC_API_URL');
    this.apiKey = this.config.getOrThrow<string>('ANTHROPIC_API_KEY');
    this.model = this.config.get<string>('ANTHROPIC_MODEL') || 'claude-sonnet-4-6';
  }

  async run(ctx: SupportingEvidenceContext, priorResults: Record<string, unknown>): Promise<IssueResult> {
    this.logger.log(`[OTHER] Starting — ${ctx.confirmedAddress}`);
    try {
      const skill = this.claudeVision.loadSkill('se-other.md');
      const meta = ctx.meta;

      const lotShape = await this.arcgis.queryLotShape(ctx.lat, ctx.lng)
        .catch(e => { this.logger.warn(`Lot shape: ${e.message}`); return { flag: null, shape_area_m2: null, perimeter_m: null, isoperimetric_q: null }; });

      const unclaimedLayers = this.findUnclaimedLayers(ctx.apiData, priorResults);

      const zoneFromPdf = await this.extractZoneFromPdf(ctx.reportText || '');

      const reportedAreaMatch =
        (ctx.reportText || '').match(/[Aa]rea[:\s]+(\d[\d,.]+)\s*(?:m²|m2|square\s+metres?)/i) ||
        (ctx.reportText || '').match(/(\d[\d,.]+)\s*(?:m²|m2|square\s+metres?)\s+(?:in\s+area|area)/i);
      const pdfAreaM2 = reportedAreaMatch ? parseFloat(reportedAreaMatch[1].replace(/,/g, '')) : null;
      const areaDiscrepancyPct = ctx.lotAreaM2 && pdfAreaM2
        ? Math.round(Math.abs((pdfAreaM2 - ctx.lotAreaM2) / ctx.lotAreaM2) * 100)
        : null;

      const zoneLayer = ctx.apiData.layers?.find(l => l.layerName === 'Land Zoning Map' && l.results?.length);
      const apiZone = (zoneLayer?.results?.[0] as Record<string, string> | undefined)?.['Zone'] || null;

      this.logger.log(`[OTHER] Lot shape Q: ${lotShape.isoperimetric_q} | Unclaimed layers: ${unclaimedLayers.length}`);

      const otherData: Record<string, unknown> = {
        lot_shape: lotShape,
        reported_area_m2: pdfAreaM2,
        cadastre_area_m2: ctx.lotAreaM2,
        area_discrepancy_pct: areaDiscrepancyPct,
        zone_from_pdf: zoneFromPdf,
        zone_from_api: apiZone,
        zone_mismatch: zoneFromPdf && apiZone ? zoneFromPdf !== apiZone : null,
        unclaimed_layers: unclaimedLayers,
        prior_results_summary: this.summarisePriorResults(priorResults),
      };

      const payload: Record<string, unknown> = {
        task: 'evaluate_other',
        property_address: ctx.confirmedAddress,
        lot: meta.lot,
        plan: meta.plan,
        assessed_land_value: meta.assessed_land_value,
        property_report_text: ctx.reportText,
        input_documents_text: ctx.inputDocumentsText,
        spatial_viewer_panel: this.eplanning.formatLayersAsText(ctx.apiData),
        other_data: otherData,
      };

      const images = [
        { label: 'NSW Planning Portal Spatial Viewer', base64: ctx.spatialBase64 },
      ];

      const result = await this.claudeVision.callClaude(payload, images, skill, 'OTHER', 5000, 2500);
      this.logger.log(`[OTHER] tick: ${result['tick']} | confidence: ${result['confidence']}`);
      return toIssueResult(result);
    } catch (err: unknown) {
      this.logger.error(`[OTHER] Fatal: ${(err as Error).message}`);
      return { tick: false, confidence: 'MANUAL_REVIEW_REQUIRED', trigger: null, text_box_content: null, documents_to_attach: [] };
    }
  }

  private findUnclaimedLayers(apiData: EplanningApiData, priorResults: Record<string, unknown>): string[] {
    const priorText = JSON.stringify(priorResults).toLowerCase();
    const unclaimed: string[] = [];
    for (const layer of apiData.layers || []) {
      if (!layer.results?.length) continue;
      const name = layer.layerName.toLowerCase();
      if (!priorText.includes(name.substring(0, 20))) unclaimed.push(layer.layerName);
    }
    for (const s of apiData.sepp || []) {
      const name = s.seppName.toLowerCase();
      if (!priorText.includes(name.substring(0, 20))) unclaimed.push(`SEPP: ${s.seppName}`);
    }
    return [...new Set(unclaimed)].slice(0, 15);
  }

  private async extractZoneFromPdf(text: string): Promise<string | null> {
    const match = text.match(/zone[:\s]+([A-Z][0-9][A-Za-z\s]{2,40})/i);
    if (match) return match[1].trim();
    if (!text || text.length < 50) return null;
    try {
      const response = await firstValueFrom(
        this.http.post<{ content: Array<{ type: string; text?: string }> }>(
          this.apiUrl,
          {
            model: this.model,
            max_tokens: 100,
            system: 'Extract zone code only from NSW property report text. Return just the zone code like "E5 Heavy Industrial" or null.',
            messages: [{ role: 'user', content: `Extract the zone code from this text:\n\n${text.substring(0, 2000)}` }],
          },
          {
            headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            timeout: 15000,
          },
        ),
      );
      const textBlock = response.data.content.find(b => b.type === 'text');
      const raw = textBlock?.text?.trim() || '';
      return raw === 'null' ? null : raw || null;
    } catch {
      return null;
    }
  }

  private summarisePriorResults(priorResults: Record<string, unknown>): Record<string, unknown> {
    const summary: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(priorResults)) {
      if (val && typeof val === 'object') {
        const issue = val as Record<string, unknown>;
        summary[key] = {
          tick: issue['tick'],
          confidence: issue['confidence'],
          trigger: issue['trigger'],
        };
      }
    }
    return summary;
  }
}
