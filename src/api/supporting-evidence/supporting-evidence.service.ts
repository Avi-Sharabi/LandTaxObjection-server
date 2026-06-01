import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EplanningApiService } from './shared/eplanning-api.service';
import { GeocodingService } from './shared/geocoding.service';
import { PuppeteerService } from './shared/puppeteer.service';
import { PdfExtractorService } from './shared/pdf-extractor.service';
import { AccessConstraintsService } from './issues/access-constraints.service';
import { PlanningIssuesService } from './issues/planning-issues.service';
import { EnvironmentalImpactsService } from './issues/environmental-impacts.service';
import { EasementsService } from './issues/easements.service';
import { HeritageService } from './issues/heritage.service';
import { ApportionmentService } from './issues/apportionment.service';
import { GroupingService } from './issues/grouping.service';
import { ConcessionService } from './issues/concession.service';
import { OtherService } from './issues/other.service';
import { InspectionService } from './issues/inspection.service';
import {
  SupportingEvidenceContext,
  SupportingEvidenceResult,
  EvidenceRawData,
  ReportMeta,
  InputComparable,
  BenchmarkReport,
  LandTaxNotice,
  IssueResult,
  GroupingIssueResult,
} from './supporting-evidence.types';
import { generateEvidenceHtml, PropMeta, IssueEvidence, DataSection } from './shared/evidence-html.util';
import { DisputeEvidenceIssue } from './entities/dispute-evidence-issue.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { AssessmentDocumentsService } from '../assessment-documents/assessment-documents.service';
import { ComparablesService } from '../comparables/comparables.service';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { Browser } from 'puppeteer';

const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';
const FOLDER = 'supporting-evidence';

@Injectable()
export class SupportingEvidenceService {
  private readonly logger = new Logger(SupportingEvidenceService.name);

  constructor(
    private readonly eplanning: EplanningApiService,
    private readonly geocoding: GeocodingService,
    private readonly puppeteerSvc: PuppeteerService,
    private readonly pdfExtractor: PdfExtractorService,
    private readonly accessConstraints: AccessConstraintsService,
    private readonly planningIssues: PlanningIssuesService,
    private readonly environmentalImpacts: EnvironmentalImpactsService,
    private readonly easements: EasementsService,
    private readonly heritage: HeritageService,
    private readonly apportionment: ApportionmentService,
    private readonly grouping: GroupingService,
    private readonly concession: ConcessionService,
    private readonly other: OtherService,
    private readonly inspection: InspectionService,
    private readonly azureBlobService: AzureBlobService,
    private readonly comparablesService: ComparablesService,
    private readonly assessmentDocumentsService: AssessmentDocumentsService,
    @InjectRepository(DisputeEvidenceIssue)
    private readonly evidenceIssuesRepository: Repository<DisputeEvidenceIssue>,
    // DisputeCase repo injected directly to avoid circular dep with DisputeCasesModule
    @InjectRepository(DisputeCase)
    private readonly disputeCasesRepository: Repository<DisputeCase>,
  ) {}

  async analyze(disputeCaseId: string, address: string): Promise<SupportingEvidenceResult> {
    this.logger.log(`[SE] Starting analysis for case ${disputeCaseId} — ${address}`);
    const runId = Date.now();
    let browser: Browser | null = null;

    try {
      browser = await this.puppeteerSvc.launch();

      const disputeCase = await this.disputeCasesRepository.findOne({ where: { id: disputeCaseId } });

      const [comparables, inputDocs] = await Promise.all([
        this.ensureComparables(disputeCaseId),
        this.fetchInputDocuments(disputeCase),
      ]);

      const inputComparables = [...comparables, ...inputDocs.salesComparables];

      const ctx = await this.gatherSharedContext(
        address,
        browser,
        inputComparables,
        inputDocs.inputBenchmarkReport,
        inputDocs.landTaxNotice,
        inputDocs.rawTexts,
      );

      // Run all 10 issues sequentially (to avoid API rate limits)
      const issue1Result = await this.accessConstraints.run(ctx);
      const issue2Result = await this.planningIssues.run(ctx);
      const issue3Result = await this.environmentalImpacts.run(ctx);
      const issue4Result = await this.easements.run(ctx);
      const issue5Result = await this.heritage.run(ctx);
      const issue6Result = await this.apportionment.run(ctx);
      const issue78Result = await this.grouping.run(ctx);
      const issue9Result = await this.concession.run(ctx, {
        issue1: { flood_data: issue1Result.flood_data, contaminated_land: issue1Result.contaminated_land },
        issue3: { environmental_impacts: issue3Result.environmental_impacts },
      });

      const priorResultsSummary = {
        access_constraints: issue1Result.access_constraints,
        planning: issue2Result.planning_issues,
        environmental: issue3Result.environmental_impacts,
        easements: issue4Result.easements,
        heritage: issue5Result.heritage,
        apportionment: issue6Result.apportionment,
        grouping: issue78Result.grouping,
        concession: issue9Result,
      };
      const issue10Result = await this.other.run(ctx, priorResultsSummary);

      const issueResults: SupportingEvidenceResult['issues'] = {
        access_constraints: issue1Result.access_constraints,
        planning: issue2Result.planning_issues,
        environmental: issue3Result.environmental_impacts,
        easements: issue4Result.easements,
        heritage: issue5Result.heritage,
        apportionment: issue6Result.apportionment,
        grouping: issue78Result.grouping,
        concession: issue9Result,
        other: issue10Result,
        inspection_access: null,
        inspection_easement: null,
        inspection_environmental: null,
        inspection_views: null,
      };

      const inspectionResults = await this.inspection.run(ctx, issueResults);
      issueResults.inspection_access = inspectionResults.inspection_access;
      issueResults.inspection_easement = inspectionResults.inspection_easement;
      issueResults.inspection_environmental = inspectionResults.inspection_environmental;
      issueResults.inspection_views = inspectionResults.inspection_views;

      const evidenceRawData: EvidenceRawData = {
        flood_data: issue1Result.flood_data,
        contaminated_land: issue1Result.contaminated_land,
        ols_data: issue4Result.rawData.ols_data,
        pdf_encumbrances: issue4Result.rawData.pdf_encumbrances,
        heritage_arcgis_items: issue5Result.rawData.heritage_arcgis_items,
        heritage_layers: issue5Result.rawData.heritage_layers,
        vg_comparables: issue6Result.rawData.vg_comparables,
        adjacent_lots: issue78Result.rawData.adjacent_lots,
      };

      if (disputeCase) {
        const artifactMap = await this.uploadAllArtifacts(disputeCaseId, disputeCase.client_id, ctx, browser, evidenceRawData, issueResults);
        await this.saveIssueResults(disputeCaseId, runId, issueResults, artifactMap);
      }

      const meta = ctx.meta;
      const lotPlan = meta.lot ? `Lot ${meta.lot} ${meta.planType} ${meta.plan}` : '';

      return {
        property_address: ctx.confirmedAddress,
        property_id: ctx.propId,
        lot_plan: lotPlan,
        assessed_land_value: meta.assessed_land_value,
        run_date: new Date().toISOString(),
        run_id: runId,
        issues: issueResults,
      };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  private async gatherSharedContext(
    address: string,
    browser: Browser,
    inputComparables: InputComparable[],
    inputBenchmarkReport: BenchmarkReport | null,
    landTaxNotice: LandTaxNotice | null,
    inputDocumentsText: string[],
  ): Promise<SupportingEvidenceContext> {
    this.logger.log(`[SE] Gathering shared context for: ${address}`);

    const { propId, confirmedAddress } = await this.eplanning.lookupProperty(address);
    const { reportText, reportBuffer } = await this.eplanning.downloadPropertyReport(propId);
    const apiData = await this.eplanning.queryLayers(propId);
    const { lat, lng } = await this.geocoding.geocode(confirmedAddress);

    const rawMeta = await this.pdfExtractor.parseReportMetaAI(reportText);
    const meta: ReportMeta = {
      lot: rawMeta['lot'] as string | null,
      plan: rawMeta['plan'] as string | null,
      planType: (rawMeta['planType'] as string) || 'DP',
      assessed_land_value: rawMeta['assessed_land_value'] as number | null,
      revenue_nsw_notice_date: rawMeta['revenue_nsw_notice_date'] as string | null,
      fsr_from_pdf: rawMeta['fsr_from_pdf'] as number | null,
      concession_mentions: (rawMeta['concession_mentions'] as string[]) || [],
      heritage_mentions: (rawMeta['heritage_mentions'] as string[]) || [],
      multiple_lots_in_report: (rawMeta['multiple_lots_in_report'] as string[]) || [],
    };

    let lotAreaM2: number | null = null;
    if (meta.lot && meta.plan) {
      lotAreaM2 = await this.eplanning.getLotArea(meta.lot, meta.plan, meta.planType).catch(e => {
        this.logger.warn(`getLotArea failed: ${e.message}`);
        return null;
      });
    }
    if (!lotAreaM2) {
      const cadInfo = await this.geocoding.getLotInfoFromCadastre(lat, lng).catch(e => {
        this.logger.warn(`Cadastre fallback failed: ${e.message}`);
        return null;
      });
      if (cadInfo?.areaM2) lotAreaM2 = cadInfo.areaM2;
    }

    const [spatialBase64, contextBase64, closeupBase64] = await Promise.all([
      this.puppeteerSvc.capturePortalScreenshot(confirmedAddress, propId, browser)
        .catch(e => { this.logger.warn(`Portal screenshot: ${e.message}`); return null; }),
      this.puppeteerSvc.captureContextSatellite(lat, lng, browser)
        .catch(e => { this.logger.warn(`Context satellite: ${e.message}`); return null; }),
      this.puppeteerSvc.captureCloseupSatellite(lat, lng, browser)
        .catch(e => { this.logger.warn(`Closeup satellite: ${e.message}`); return null; }),
    ]);

    return {
      propId,
      confirmedAddress,
      reportText,
      reportBuffer,
      apiData,
      lat,
      lng,
      lotAreaM2,
      meta,
      spatialBase64,
      contextBase64,
      closeupBase64,
      inputComparables,
      inputBenchmarkReport,
      landTaxNotice,
      inputDocumentsText,
    };
  }

  // Fetch comparables from DB; generate inline if none exist yet
  private async ensureComparables(disputeCaseId: string): Promise<InputComparable[]> {
    let sales = await this.comparablesService.findRawByDisputeCaseId(disputeCaseId);

    if (!sales.length) {
      this.logger.log(`[SE] No comparables found for ${disputeCaseId} — generating inline`);
      try {
        await this.comparablesService.generateComparableSales(
          { dispute_case_id: disputeCaseId },
          SYSTEM_ACTOR_ID,
        );
        sales = await this.comparablesService.findRawByDisputeCaseId(disputeCaseId);
      } catch (e) {
        this.logger.warn(`[SE] Inline comparables generation failed: ${(e as Error).message}`);
      }
    }

    return sales
      .filter(s => s.adjusted_land_value != null && s.area != null)
      .map(s => ({
        address: [s.property_house_number, s.property_street_name, s.property_locality]
          .filter(Boolean)
          .join(' '),
        area_m2: s.area!,
        zone: s.zoning ?? undefined,
        analysed_land_value: s.adjusted_land_value!,
        rate_per_m2: s.adjusted_rate_per_sqm ?? undefined,
        contract_date: s.contract_date?.toISOString().split('T')[0] ?? undefined,
      }));
  }

  // Classify uploaded PDFs for typed structs AND extract raw text for all docs
  private async fetchInputDocuments(disputeCase: DisputeCase | null): Promise<{
    landTaxNotice: LandTaxNotice | null;
    inputBenchmarkReport: BenchmarkReport | null;
    salesComparables: InputComparable[];
    rawTexts: string[];
  }> {
    if (!disputeCase) return { landTaxNotice: null, inputBenchmarkReport: null, salesComparables: [], rawTexts: [] };

    const docs = await this.assessmentDocumentsService.findByClientId(disputeCase.client_id);

    let landTaxNotice: LandTaxNotice | null = null;
    let inputBenchmarkReport: BenchmarkReport | null = null;
    const salesComparables: InputComparable[] = [];
    const rawTexts: string[] = [];

    const processed = await Promise.all(
      docs.map(async (doc) => {
        if (!doc.file_path) return null;
        try {
          const buffer = await this.azureBlobService.getFileContent(doc.file_path);
          const rawText = await this.pdfExtractor.parseBuffer(buffer);
          const result = await this.pdfExtractor.classifyAndExtractDocument(buffer, doc.document_name);
          return { rawText, result };
        } catch (e) {
          this.logger.warn(`Failed to process assessment doc ${doc.id}: ${(e as Error).message}`);
          return null;
        }
      }),
    );

    for (const item of processed) {
      if (!item) continue;
      if (item.rawText?.trim()) rawTexts.push(item.rawText);
      if (!item.result) continue;
      if (item.result.document_type === 'land_tax_notice') {
        landTaxNotice = item.result as unknown as LandTaxNotice;
      } else if (item.result.document_type === 'benchmark_report') {
        inputBenchmarkReport = item.result as unknown as BenchmarkReport;
        if (inputBenchmarkReport.sales?.length) salesComparables.push(...inputBenchmarkReport.sales);
      } else if (item.result.document_type === 'sales_report') {
        const salesData = item.result as { sales?: InputComparable[] };
        if (salesData.sales?.length) salesComparables.push(...salesData.sales);
      }
    }

    return { landTaxNotice, inputBenchmarkReport, salesComparables, rawTexts };
  }

  private async uploadAllArtifacts(
    disputeCaseId: string,
    clientId: string,
    ctx: SupportingEvidenceContext,
    browser: Browser | null,
    rawData: EvidenceRawData,
    issueResults: SupportingEvidenceResult['issues'],
  ): Promise<Map<string, string>> {
    const artifactMap = new Map<string, string>();
    const meta: PropMeta = {
      address: ctx.confirmedAddress,
      propId: ctx.propId,
      lotPlan: ctx.meta.lot ? `Lot ${ctx.meta.lot} ${ctx.meta.planType} ${ctx.meta.plan}` : '',
    };

    const uploadBlob = async (blobPath: string, base64: string, documentName: string, artifactKey: string) => {
      const filePath = await this.azureBlobService.uploadFile(blobPath, base64);
      if (!filePath) return;
      const doc = await this.assessmentDocumentsService.createArtifactRecord(clientId, documentName, filePath);
      artifactMap.set(artifactKey, doc.id);
    };

    // 1 — Screenshots (PNG)
    for (const { key, base64 } of [
      { key: 'spatial_viewer', base64: ctx.spatialBase64 },
      { key: 'satellite_closeup', base64: ctx.closeupBase64 },
    ]) {
      if (!base64) continue;
      try {
        await uploadBlob(`${FOLDER}/${disputeCaseId}/${key}.png`, base64, key, key);
      } catch (e) {
        this.logger.warn(`Screenshot upload failed (${key}): ${(e as Error).message}`);
      }
    }

    // 2 — Property report PDF
    if (ctx.reportBuffer && browser) {
      try {
        await uploadBlob(
          `${FOLDER}/${disputeCaseId}/property_report.pdf`,
          ctx.reportBuffer.toString('base64'),
          'Property Report',
          'property_report',
        );
      } catch (e) {
        this.logger.warn(`Property report upload failed: ${(e as Error).message}`);
      }
    }

    if (!browser) return artifactMap;

    // 3 — Per-issue evidence PDFs (finding + argument + supporting data)
    const floodLayers = ctx.apiData.layers?.filter(l => /flood/i.test(l.layerName) && l.results?.length) ?? [];
    const easementLayers = ctx.apiData.layers?.filter(l =>
      /easement|carriageway|right.of.way|covenant|restriction|pipeline|transmission/i.test(l.layerName) && l.results?.length
    ) ?? [];
    const contaminationSepps = (ctx.apiData.sepp ?? []).filter(s =>
      /No.*55|No.*33|remediation|hazard/i.test(String((s as unknown as Record<string, unknown>)?.seppName ?? ''))
    );

    const issuePdfDefs: Array<{
      key: string;
      label: string;
      issueResult: IssueResult | GroupingIssueResult | null;
      sections: DataSection[];
    }> = [
      {
        key: 'evidence_planning',
        label: 'Planning Issues',
        issueResult: issueResults.planning ?? null,
        sections: [
          { label: 'SEPP Overlays', data: ctx.apiData.sepp },
          { label: 'Hazard & OLS Warnings', data: ctx.apiData.warn },
        ],
      },
      {
        key: 'evidence_environmental',
        label: 'Environmental Impacts',
        issueResult: issueResults.environmental ?? null,
        sections: [
          { label: 'Contaminated Land (ArcGIS)', data: rawData.contaminated_land },
          { label: 'SEPP Overlays (Contamination / Hazards)', data: contaminationSepps },
        ],
      },
      {
        key: 'evidence_access_constraints',
        label: 'Access Constraints',
        issueResult: issueResults.access_constraints ?? null,
        sections: [
          { label: 'ArcGIS Flood Data', data: rawData.flood_data },
          { label: 'Flood Planning Layers (ePlanning)', data: floodLayers },
        ],
      },
      {
        key: 'evidence_easements',
        label: 'Easements & Encumbrances',
        issueResult: issueResults.easements ?? null,
        sections: [
          { label: 'Obstacle Limitation Surface', data: rawData.ols_data },
          { label: 'PDF Encumbrances', data: rawData.pdf_encumbrances },
          { label: 'Easement Layers (ePlanning)', data: easementLayers },
        ],
      },
      {
        key: 'evidence_heritage',
        label: 'Heritage',
        issueResult: issueResults.heritage ?? null,
        sections: [
          { label: 'Heritage Items (ArcGIS)', data: rawData.heritage_arcgis_items },
          { label: 'Heritage Layers (ePlanning)', data: rawData.heritage_layers },
        ],
      },
      {
        key: 'evidence_apportionment',
        label: 'Apportionment',
        issueResult: issueResults.apportionment ?? null,
        sections: [
          { label: 'VG Comparable Land Values (ArcGIS)', data: rawData.vg_comparables },
        ],
      },
      {
        key: 'evidence_grouping',
        label: 'Grouping & Aggregation',
        issueResult: issueResults.grouping ?? null,
        sections: [
          { label: 'Adjacent Lots (Cadastre)', data: rawData.adjacent_lots },
        ],
      },
      {
        key: 'evidence_concession',
        label: 'Concession / Constraint Allowance',
        issueResult: issueResults.concession ?? null,
        sections: [
          { label: 'ArcGIS Flood Data', data: rawData.flood_data },
          { label: 'SEPP Overlays', data: ctx.apiData.sepp },
        ],
      },
      {
        key: 'evidence_other',
        label: 'Other Grounds',
        issueResult: issueResults.other ?? null,
        sections: [],
      },
    ];

    const isGroupingResult = (r: IssueResult | GroupingIssueResult): r is GroupingIssueResult =>
      'valued_together' in r;

    for (const def of issuePdfDefs) {
      if (!def.issueResult) continue;

      const tick = isGroupingResult(def.issueResult)
        ? def.issueResult.valued_together.tick
        : def.issueResult.tick;
      if (!tick) continue;

      const hasSections = def.sections.some(s => s.data != null && (!Array.isArray(s.data) || (s.data as unknown[]).length > 0));
      const hasArg = isGroupingResult(def.issueResult)
        ? !!(def.issueResult.valued_together.text_box_content)
        : !!(def.issueResult.text_box_content);
      if (!hasSections && !hasArg) continue;

      const ie: IssueEvidence | undefined = def.issueResult
        ? isGroupingResult(def.issueResult)
          ? {
              tick: def.issueResult.valued_together.tick,
              confidence: def.issueResult.valued_together.confidence,
              trigger: def.issueResult.valued_together.trigger ?? null,
              text_box_content: def.issueResult.valued_together.text_box_content ?? null,
            }
          : {
              tick: def.issueResult.tick,
              confidence: def.issueResult.confidence,
              trigger: def.issueResult.trigger,
              text_box_content: def.issueResult.text_box_content,
            }
        : undefined;

      await this.generateAndUploadEvidencePdf(
        def.key, def.label, null, meta, disputeCaseId, clientId, browser, artifactMap,
        ie, def.sections,
      );
    }

    return artifactMap;
  }

  private async generateAndUploadEvidencePdf(
    key: string,
    label: string,
    data: unknown,
    meta: PropMeta,
    disputeCaseId: string,
    clientId: string,
    browser: import('puppeteer').Browser,
    artifactMap: Map<string, string>,
    issueEvidence?: IssueEvidence,
    sections?: DataSection[],
  ): Promise<void> {
    try {
      const html = generateEvidenceHtml(label, data, meta, issueEvidence, sections);
      const pdfBuffer = await this.puppeteerSvc.renderHtmlToPdfBuffer(html, browser);
      const base64 = pdfBuffer.toString('base64');
      const blobPath = `${FOLDER}/${disputeCaseId}/evidence/${key}.pdf`;
      const filePath = await this.azureBlobService.uploadFile(blobPath, base64);
      if (!filePath) return;
      const doc = await this.assessmentDocumentsService.createArtifactRecord(clientId, label, filePath);
      artifactMap.set(key, doc.id);
    } catch (e) {
      this.logger.warn(`Evidence PDF failed (${key}): ${(e as Error).message}`);
    }
  }

  private async saveIssueResults(
    disputeCaseId: string,
    runId: number,
    issues: SupportingEvidenceResult['issues'],
    artifactMap: Map<string, string>,
  ): Promise<void> {
    const rows: Partial<DisputeEvidenceIssue>[] = [];

    for (const [issueType, result] of Object.entries(issues)) {
      if (!result) continue;

      const flat = 'valued_together' in result
        ? (result as GroupingIssueResult).valued_together
        : (result as IssueResult);
      const rawAttach: string[] = flat.documents_to_attach ?? [];
      const documents_to_attach = rawAttach.map(name => artifactMap.get(name) ?? name);

      rows.push({
        dispute_case_id: disputeCaseId,
        issue_type: issueType,
        is_tick: flat.tick,
        confidence: flat.confidence ?? null,
        trigger: flat.trigger ?? null,
        text_box_content: flat.text_box_content ?? null,
        documents_to_attach,
        run_id: runId,
      });
    }

    if (rows.length) await this.evidenceIssuesRepository.save(rows);
  }
}
