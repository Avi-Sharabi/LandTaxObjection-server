import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Browser } from 'puppeteer';
import { EplanningApiService } from './shared/eplanning-api.service';
import { GeocodingService } from './shared/geocoding.service';
import { PuppeteerService } from './shared/puppeteer.service';
import { PdfExtractorService } from './shared/pdf-extractor.service';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { AssessmentDocumentsService } from '../assessment-documents/assessment-documents.service';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { EvidenceDisputeCaseNotFoundException } from './exceptions/supporting-evidence.exceptions';
import {
  SupportingEvidenceContext,
  ReportMeta,
  InputComparable,
  BenchmarkReport,
  LandTaxNotice,
} from './supporting-evidence.types';

const FOLDER = 'supporting-evidence';

interface InputDocuments {
  salesComparables: InputComparable[];
  inputBenchmarkReport: BenchmarkReport | null;
  landTaxNotice: LandTaxNotice | null;
  rawTexts: string[];
}

@Injectable()
export class PropertyContextService {
  private readonly logger = new Logger(PropertyContextService.name);

  constructor(
    private readonly eplanning: EplanningApiService,
    private readonly geocoding: GeocodingService,
    private readonly puppeteerSvc: PuppeteerService,
    private readonly pdfExtractor: PdfExtractorService,
    private readonly azureBlobService: AzureBlobService,
    private readonly assessmentDocumentsService: AssessmentDocumentsService,
    @InjectRepository(DisputeCase)
    private readonly disputeCasesRepository: Repository<DisputeCase>,
  ) {}

  async gather(
    disputeCaseId: string,
    address: string,
  ): Promise<{ ctx: SupportingEvidenceContext; artifactDocIds: Map<string, string> }> {
    const disputeCase = await this.disputeCasesRepository.findOne({ where: { id: disputeCaseId } });
    if (!disputeCase) {
      this.logger.error(`[CTX] Dispute case ${disputeCaseId} not found — cannot save artifacts`);
      throw new EvidenceDisputeCaseNotFoundException(disputeCaseId);
    }
    const inputDocs = await this.fetchInputDocuments(disputeCase);
    let browser: Browser | null = null;
    try {
      browser = await this.puppeteerSvc.launch();
      const ctx = await this.gatherSharedContext(address, browser, inputDocs);
      const artifactDocIds = new Map<string, string>();
      await this.saveInitialArtifacts(disputeCaseId, disputeCase.client_id, ctx, artifactDocIds);
      return { ctx, artifactDocIds };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  private async gatherSharedContext(
    address: string,
    browser: Browser,
    inputDocs: InputDocuments,
  ): Promise<SupportingEvidenceContext> {
    this.logger.log(`[CTX] Gathering shared context for: ${address}`);

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
      land_area_sqm: (rawMeta['land_area_sqm'] as number | null) ?? null,
      height_limit_m: (rawMeta['height_limit_m'] as number | null) ?? null,
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
    if (!lotAreaM2 && meta.land_area_sqm) {
      lotAreaM2 = meta.land_area_sqm;
    }

    const spatialBase64 = await this.puppeteerSvc.capturePortalScreenshot(confirmedAddress, propId, browser)
      .catch(e => { this.logger.warn(`Portal screenshot: ${e.message}`); return null; });
    const contextBase64 = await this.puppeteerSvc.captureContextSatellite(lat, lng, browser)
      .catch(e => { this.logger.warn(`Context satellite: ${e.message}`); return null; });
    const closeupBase64 = await this.puppeteerSvc.captureCloseupSatellite(lat, lng, browser)
      .catch(e => { this.logger.warn(`Closeup satellite: ${e.message}`); return null; });

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
      inputComparables: inputDocs.salesComparables,
      inputBenchmarkReport: inputDocs.inputBenchmarkReport,
      landTaxNotice: inputDocs.landTaxNotice,
      inputDocumentsText: inputDocs.rawTexts,
      entityEvidence: null,
      evidenceResult: null,
    };
  }

  async fetchInputDocuments(disputeCase: DisputeCase | null): Promise<InputDocuments> {
    if (!disputeCase) return { salesComparables: [], inputBenchmarkReport: null, landTaxNotice: null, rawTexts: [] };

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

    return { salesComparables, inputBenchmarkReport, landTaxNotice, rawTexts };
  }

  private async saveInitialArtifacts(
    disputeCaseId: string,
    clientId: string,
    ctx: SupportingEvidenceContext,
    artifactDocIds: Map<string, string>,
  ): Promise<void> {
    const uploadBlob = async (blobPath: string, base64: string, documentName: string, key: string) => {
      const filePath = await this.azureBlobService.uploadFile(blobPath, base64);
      if (!filePath) {
        this.logger.warn(`Azure uploadFile returned null for ${blobPath}`);
        return;
      }
      const doc = await this.assessmentDocumentsService.createArtifactRecord(clientId, documentName, filePath);
      artifactDocIds.set(key, doc.id);
    };

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

    if (ctx.reportBuffer) {
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
  }
}
