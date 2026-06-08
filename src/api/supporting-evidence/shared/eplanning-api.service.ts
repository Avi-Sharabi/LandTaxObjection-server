import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { EplanningApiData, ReportMeta } from '../supporting-evidence.types';
import { PDFParse } from 'pdf-parse';
import {
  EplanningAddressNotFoundException,
  EplanningCadastreException,
  EplanningLotNotFoundException,
  EplanningReportUrlException,
} from '../exceptions/supporting-evidence.exceptions';

const BASE = 'https://api.apps1.nsw.gov.au/planning/viewersf/V1/ePlanningApi';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.planningportal.nsw.gov.au/spatialviewer/',
};

@Injectable()
export class EplanningApiService {
  private static readonly QUERY_TIMEOUT_MS = 15_000;
  private static readonly DOWNLOAD_TIMEOUT_MS = 30_000;

  private readonly logger = new Logger(EplanningApiService.name);

  constructor(private readonly http: HttpService) {}

  async lookupProperty(address: string): Promise<{ propId: string; confirmedAddress: string }> {
    const res = await firstValueFrom(
      this.http.get<Array<{ propId: string; address: string }>>(
        `${BASE}/address?a=${encodeURIComponent(address)}&noOfRecords=5`,
        { headers: HEADERS, timeout: EplanningApiService.QUERY_TIMEOUT_MS },
      ),
    );
    const results = res.data;
    if (!Array.isArray(results) || results.length === 0) {
      throw new EplanningAddressNotFoundException(address);
    }
    const best = results[0];
    this.logger.log(`Resolved: "${best.address}" → propId: ${best.propId}`);
    return { propId: best.propId, confirmedAddress: best.address };
  }

  async downloadPropertyReport(propId: string): Promise<{ reportText: string; reportBuffer: Buffer }> {
    const reportRes = await firstValueFrom(
      this.http.get<{ reportUrl?: string }>(
        `${BASE}/report?type=property&id=${propId}`,
        { headers: HEADERS, timeout: EplanningApiService.QUERY_TIMEOUT_MS },
      ),
    );
    const pdfUrl = reportRes.data?.reportUrl;
    if (!pdfUrl) throw new EplanningReportUrlException(propId);

    const pdfRes = await firstValueFrom(
      this.http.get<ArrayBuffer>(pdfUrl, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: EplanningApiService.DOWNLOAD_TIMEOUT_MS,
      }),
    );
    const buf = Buffer.from(pdfRes.data as unknown as ArrayBuffer);
    const pdfData = await new PDFParse({ data: buf }).getText();
    this.logger.log(`PDF parsed: ${pdfData.text.length} chars`);
    return { reportText: pdfData.text, reportBuffer: buf };
  }

  async queryLayers(propId: string): Promise<EplanningApiData> {
    this.logger.log(`Querying ePlanning layers for propId: ${propId}`);
    const [layers, sepp, warn, council] = await Promise.all([
      firstValueFrom(this.http.get<unknown[]>(`${BASE}/layerintersect?id=${propId}&type=property`, { headers: HEADERS, timeout: EplanningApiService.QUERY_TIMEOUT_MS }))
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(e => { this.logger.error(`layerintersect failed for propId ${propId}: ${e.message}`); return []; }),

      firstValueFrom(this.http.get<unknown[]>(`${BASE}/sepp?type=property&id=${propId}&layers=sepp`, { headers: HEADERS, timeout: EplanningApiService.QUERY_TIMEOUT_MS }))
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(e => { this.logger.error(`sepp failed for propId ${propId}: ${e.message}`); return []; }),

      firstValueFrom(this.http.get<unknown[]>(`${BASE}/warn?id=${propId}&type=property`, { headers: HEADERS, timeout: EplanningApiService.QUERY_TIMEOUT_MS }))
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(e => { this.logger.error(`warn failed for propId ${propId}: ${e.message}`); return []; }),

      firstValueFrom(this.http.get<string[]>(`${BASE}/council?propId=${propId}`, { headers: HEADERS, timeout: EplanningApiService.QUERY_TIMEOUT_MS }))
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(e => { this.logger.error(`council failed for propId ${propId}: ${e.message}`); return []; }),
    ]);

    return { layers: layers as EplanningApiData['layers'], sepp: sepp as EplanningApiData['sepp'], warn: warn as EplanningApiData['warn'], council: council as string[] };
  }

  async getLotArea(lot: string, plan: string, planType = 'DP'): Promise<number> {
    const query = `${lot} ${planType} ${plan}`;
    const lotRes = await firstValueFrom(
      this.http.get<Array<{ cadId: string }>>(`${BASE}/lot?l=${encodeURIComponent(query)}`, { headers: HEADERS, timeout: EplanningApiService.QUERY_TIMEOUT_MS }),
    );
    const lotData = lotRes.data;
    if (!Array.isArray(lotData) || lotData.length === 0) throw new EplanningLotNotFoundException(query);
    const cadId = lotData[0]?.cadId;
    if (!cadId) throw new EplanningCadastreException('No cadId in lot response');

    const cadRes = await firstValueFrom(
      this.http.get<{ features: Array<{ attributes: { shape_Area: number } }> }>(
        'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer/9/query',
        { params: { where: `cadid=${cadId}`, outFields: 'shape_Area', f: 'json' }, timeout: EplanningApiService.QUERY_TIMEOUT_MS },
      ),
    );
    const feats = cadRes.data?.features;
    if (!feats?.length) throw new EplanningCadastreException('No cadastre feature found');
    const rawArea = feats[0].attributes?.shape_Area;
    if (!rawArea) throw new EplanningCadastreException('shape_Area is null');
    return Math.round(rawArea);
  }

  formatLayersAsText(apiData: EplanningApiData): string {
    const { layers = [], sepp = [], warn = [], council = [] } = apiData;
    const lines: string[] = [];

    if (council[0]) lines.push(`Council: ${council[0]}`);

    const layerMap: Record<string, Record<string, unknown>[]> = {};
    for (const layer of layers) {
      if (layer.results?.length) layerMap[layer.layerName] = layer.results as Record<string, unknown>[];
    }

    const zone = layerMap['Land Zoning Map']?.[0] as Record<string, string> | undefined;
    if (zone) lines.push(`Zone: ${zone['Zone']} — ${zone['Land Use']} — ${zone['EPI Name']} (${zone['LGA Name']})`);

    const lotSize = layerMap['Lot Size Map']?.[0] as Record<string, string> | undefined;
    if (lotSize) lines.push(`Minimum Lot Size: ${lotSize['Lot Size']} m² — ${lotSize['EPI Name']} ${lotSize['Legislative Clause'] || ''}`);

    const height = layerMap['Height of Buildings Map']?.[0] as Record<string, string> | undefined;
    if (height) lines.push(`Maximum Height: ${height['Maximum Building Height']} m — ${height['EPI Name']}`);

    const ass = layerMap['Acid Sulfate Soils Map']?.[0] as Record<string, string> | undefined;
    if (ass) lines.push(`Acid Sulfate Soils: ${ass['Class']} — ${ass['EPI Name']}`);

    const bushfire = layerMap['Bushfire Prone Land (Non-EPI)']?.[0] as Record<string, string> | undefined;
    if (bushfire) lines.push(`Bushfire Prone Land: ${bushfire['Category'] || bushfire['title']} — Guideline ${bushfire['Guideline'] || ''}`);

    for (const [name, results] of Object.entries(layerMap)) {
      if (/flood/i.test(name) && results[0]) {
        const r = results[0] as Record<string, string>;
        lines.push(`Flood Overlay: ${r['title'] || r['EPI Name'] || name}`);
      }
    }

    for (const [name, results] of Object.entries(layerMap)) {
      if (/heritage/i.test(name) && results[0]) {
        const r = results[0] as Record<string, string>;
        lines.push(`Heritage Layer: ${name} — ${r['title'] || r['EPI Name'] || r['NAME'] || JSON.stringify(r)}`);
      }
    }

    const easementLikeNames = layers
      .filter(l => /easement|carriageway|right.of.way|covenant|restriction|pipeline|transmission/i.test(l.layerName))
      .map(l => l.layerName);
    if (easementLikeNames.length) lines.push('Easement / Restriction Layers: ' + easementLikeNames.join(', '));

    if (sepp.length) {
      lines.push('', 'SEPP Overlays:');
      for (const s of sepp) {
        lines.push(`  ${s.seppName}`);
        if (s.mapName?.length) for (const m of s.mapName) lines.push(`    - ${m}`);
      }
    }

    if (warn.length) {
      lines.push('', 'Hazard Warnings:');
      for (const w of warn) lines.push(`  ${w.title || w.layerRef || JSON.stringify(w)}`);
    }

    return lines.join('\n') || '';
  }

  parseReportMeta(text: string): ReportMeta {
    const dpMatch = text.match(/Lot\s+(\d+[A-Z]?)\s+(?:in\s+)?(?:Deposited\s+Plan\s+|DP\s*)(\d+)/i);
    const spMatch = text.match(/Lot\s+(\d+[A-Z]?)\s+(?:in\s+)?(?:Strata\s+Plan\s+|SP\s*)(\d+)/i);
    const lotPlan = dpMatch || spMatch;
    const planType = dpMatch ? 'DP' : spMatch ? 'SP' : 'DP';

    const lvMatch =
      text.match(/[Ll]and\s+[Vv]alue[:\s]+\$?\s*([\d,]+)/i) ||
      text.match(/[Aa]ssessed\s+(?:[Ll]and\s+)?[Vv]alue[:\s]+\$?\s*([\d,]+)/i) ||
      text.match(/\$\s*([\d,]+)\s*(?:as\s+at|at\s+\d)/i);

    const dateMatch =
      text.match(/[Aa]s\s+at\s+(\d{1,2}\s+\w+\s+\d{4})/i) ||
      text.match(/(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i);

    const fsrMatch =
      text.match(/[Ff]loor\s+[Ss]pace\s+[Rr]atio[^0-9]*(\d+\.?\d*)\s*:\s*1/i) ||
      text.match(/\bFSR[^0-9]*(\d+\.?\d*)\s*:\s*1/i);

    const concessionMentions = [...text.matchAll(/(?:concession|allowance|discount|deduction)[^\n]{0,200}/gi)]
      .map(m => m[0].trim().replace(/\s+/g, ' '));

    const heritageMentions = [...text.matchAll(/(?:heritage|listed heritage|conservation area)[^\n]{0,200}/gi)]
      .map(m => m[0].trim().replace(/\s+/g, ' '));

    const multipleLots = [...text.matchAll(/Lot\s+\d+[A-Z]?\s+(?:in\s+)?(?:DP|SP|Deposited Plan|Strata Plan)\s*\d+/gi)]
      .map(m => m[0].trim());

    return {
      lot: lotPlan ? lotPlan[1] : null,
      plan: lotPlan ? lotPlan[2] : null,
      planType,
      assessed_land_value: lvMatch ? parseInt(lvMatch[1].replace(/,/g, '')) : null,
      revenue_nsw_notice_date: dateMatch ? dateMatch[1].trim() : null,
      fsr_from_pdf: fsrMatch ? parseFloat(fsrMatch[1]) : null,
      land_area_sqm: null,
      height_limit_m: null,
      concession_mentions: [...new Set(concessionMentions)],
      heritage_mentions: [...new Set(heritageMentions)],
      multiple_lots_in_report: [...new Set(multipleLots)],
    };
  }
}
