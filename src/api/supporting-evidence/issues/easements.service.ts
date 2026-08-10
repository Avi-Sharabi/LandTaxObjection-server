import { Injectable, Logger } from '@nestjs/common';
import { ArcgisService } from '../shared/arcgis.service';
import { ClaudeVisionService } from '../shared/claude-vision.service';
import { EplanningApiService } from '../shared/eplanning-api.service';
import { SupportingEvidenceContext, IssueResult } from '../supporting-evidence.types';
import { toIssueResult } from '../shared/issue-result.mapper';

const ENCUMBRANCE_PATTERNS = [
  /easement[^\n]{0,150}/gi,
  /right[- ]of[- ]way[^\n]{0,150}/gi,
  /carriageway[^\n]{0,150}/gi,
  /covenant[^\n]{0,150}/gi,
  /restriction[^\n]{0,150}/gi,
  /gas\s+main[^\n]{0,100}/gi,
  /water\s+main[^\n]{0,100}/gi,
  /sewer[^\n]{0,100}/gi,
  /pipeline[^\n]{0,150}/gi,
  /transmission\s+line[^\n]{0,150}/gi,
  /electricity[^\n]{0,150}/gi,
  /overhead\s+line[^\n]{0,150}/gi,
  /telegraph[^\n]{0,150}/gi,
  /storm\s+water[^\n]{0,100}/gi,
  /drainage[^\n]{0,100}/gi,
  /electricity\s+supply[^\n]{0,100}/gi,
  /telecommunications[^\n]{0,100}/gi,
  /council\s+drain[^\n]{0,100}/gi,
  /no\s+build\s+zone[^\n]{0,100}/gi,
];

@Injectable()
export class EasementsService {
  private readonly logger = new Logger(EasementsService.name);

  constructor(
    private readonly arcgis: ArcgisService,
    private readonly claudeVision: ClaudeVisionService,
    private readonly eplanning: EplanningApiService,
  ) {}

  async run(ctx: SupportingEvidenceContext): Promise<{ easements: IssueResult; rawData: { ols_data: Record<string, unknown>[] | null; pdf_encumbrances: string[] } }> {
    this.logger.log(`[EASEMENTS] Starting — ${ctx.confirmedAddress}`);
    try {
      const skill = this.claudeVision.loadSkill('se-easements.md');
      const meta = ctx.meta;

      const pdfEncumbrances = ENCUMBRANCE_PATTERNS
        .flatMap(rx => [...(ctx.reportText || '').matchAll(rx)].map(m => m[0].trim().replace(/\s+/g, ' ')))
        .filter((v, i, arr) => arr.indexOf(v) === i);

      const eplanningEasementLayers = ctx.apiData.layers
        .filter(l => /easement|carriageway|right.of.way|covenant|restriction|pipeline|transmission/i.test(l.layerName) && l.results?.length)
        .map(l => ({ layerName: l.layerName, results: l.results[0] }));

      let olsData: Record<string, unknown>[] | null = null;
      if (ctx.lat && ctx.lng) {
        olsData = await this.arcgis.queryOLSLayer(ctx.lat, ctx.lng).catch(e => { this.logger.warn(`OLS: ${e.message}`); return null; });
      }

      const easementData: Record<string, unknown> = {
        pdf_encumbrances: pdfEncumbrances,
        eplanning_easement_layers: eplanningEasementLayers,
        ols_data: olsData,
        ols_warning: olsData?.length ? 'Obstacle Limitation Surface applies — height restrictions near airport' : null,
        lot_area_m2: ctx.lotAreaM2,
      };

      this.logger.log(`[EASEMENTS] pdf mentions: ${pdfEncumbrances.length} | ePlanning layers: ${eplanningEasementLayers.length} | OLS: ${olsData?.length ?? 0}`);

      const payload: Record<string, unknown> = {
        task: 'evaluate_easements',
        property_address: ctx.confirmedAddress,
        lot: meta.lot || 'unknown',
        plan: meta.plan ? `${meta.planType}${meta.plan}` : 'unknown',
        assessed_land_value: meta.assessed_land_value || 'unknown',
        lot_area_m2: ctx.lotAreaM2,
        lga: ctx.apiData.council?.[0] || null,
        property_report_text: ctx.reportText || '',
        input_documents_text: ctx.inputDocumentsText,
        spatial_viewer_panel: this.eplanning.formatLayersAsText(ctx.apiData),
        easement_data: easementData,
      };

      const images = [
        { label: 'NSW Planning Portal Spatial Viewer — easement overlays', base64: ctx.spatialBase64 },
        { label: 'Google Maps satellite zoom 19 — physical presence of easements', base64: ctx.closeupBase64 },
      ];

      const result = await this.claudeVision.callClaude(payload, images, skill, 'EASEMENTS', 5000, 2500);
      this.logger.log(`[EASEMENTS] tick: ${result['tick']} | confidence: ${result['confidence']}`);
      return { easements: toIssueResult(result), rawData: { ols_data: olsData, pdf_encumbrances: pdfEncumbrances } };
    } catch (err: unknown) {
      this.logger.error(`[EASEMENTS] Fatal: ${(err as Error).message}`);
      return { easements: { tick: false, confidence: 'MANUAL_REVIEW_REQUIRED', verification_status: 'AI_DETECTED_UNVERIFIED', trigger: null, text_box_content: null, documents_to_attach: [] }, rawData: { ols_data: null, pdf_encumbrances: [] } };
    }
  }
}
