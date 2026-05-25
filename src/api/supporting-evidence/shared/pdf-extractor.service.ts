import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFParse } from 'pdf-parse';
import Anthropic from '@anthropic-ai/sdk';
import { LandTaxNotice, BenchmarkReport, InputComparable } from '../supporting-evidence.types';
import { PdfParseException } from '../exceptions/supporting-evidence.exceptions';

export interface ParsedInputDocuments {
  land_tax_notice?: LandTaxNotice;
  benchmark_report?: BenchmarkReport;
  sales_report?: { sales: InputComparable[] };
}

@Injectable()
export class PdfExtractorService {
  private readonly logger = new Logger(PdfExtractorService.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.getOrThrow<string>('ANTHROPIC_API_KEY');
    const baseURL = this.config.get<string>('ANTHROPIC_API_URL')?.replace(/\/v1\/messages\/?$/, '');
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
    this.model = this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6';
  }

  async parseBuffer(buf: Buffer): Promise<string> {
    const data = await new PDFParse({ data: buf }).getText();
    return data.text;
  }

  async parseReportMetaAI(text: string): Promise<Record<string, unknown>> {
    if (!text || text.trim().length < 20) return this.parseReportMetaRegex(text);

    const prompt = `Extract the following fields from this NSW Planning Portal property report text.

Return this exact JSON shape (null for missing fields, [] for empty arrays):
{
  "lot": "<lot number as string e.g. '9', or null>",
  "plan": "<plan number as string e.g. '1053060', or null>",
  "planType": "<'DP' or 'SP'>",
  "assessed_land_value": <integer dollar amount with no $ or commas, or null>,
  "revenue_nsw_notice_date": "<date string e.g. '1 July 2024', or null>",
  "fsr_from_pdf": <floor space ratio as decimal e.g. 1.5 from '1.5:1', or null>,
  "concession_mentions": ["<verbatim text snippets containing: concession, allowance, discount, deduction>"],
  "heritage_mentions": ["<verbatim text snippets containing: heritage, conservation area>"],
  "multiple_lots_in_report": ["<every lot/DP or lot/SP reference found e.g. 'Lot 9 DP1053060'>"]
}

DOCUMENT TEXT:
${text}`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 600,
        system: 'You are a document parser for NSW property documents. Return only valid JSON — no commentary, no markdown fences.',
        messages: [{ role: 'user', content: prompt }],
      });
      const textBlock = response.content.find((b) => b.type === 'text') as Anthropic.Messages.TextBlock | undefined;
      if (!textBlock?.text) throw new PdfParseException('no text block in report meta response');
      const raw = textBlock.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (e: unknown) {
      this.logger.warn(`parseReportMetaAI failed (${(e as Error).message}), falling back to regex`);
      return this.parseReportMetaRegex(text);
    }
  }

  private parseReportMetaRegex(text: string): Record<string, unknown> {
    const dpMatch = text.match(/Lot\s+(\d+[A-Z]?)\s+(?:in\s+)?(?:Deposited\s+Plan\s+|DP\s*)(\d+)/i);
    const spMatch = text.match(/Lot\s+(\d+[A-Z]?)\s+(?:in\s+)?(?:Strata\s+Plan\s+|SP\s*)(\d+)/i);
    const lotPlan = dpMatch || spMatch;
    const planType = dpMatch ? 'DP' : spMatch ? 'SP' : 'DP';
    const lvMatch = text.match(/[Ll]and\s+[Vv]alue[:\s]+\$?\s*([\d,]+)/i);
    const dateMatch = text.match(/[Aa]s\s+at\s+(\d{1,2}\s+\w+\s+\d{4})/i);
    const fsrMatch = text.match(/[Ff]loor\s+[Ss]pace\s+[Rr]atio[^0-9]*(\d+\.?\d*)\s*:\s*1/i);
    return {
      lot: lotPlan ? lotPlan[1] : null,
      plan: lotPlan ? lotPlan[2] : null,
      planType,
      assessed_land_value: lvMatch ? parseInt(lvMatch[1].replace(/,/g, '')) : null,
      revenue_nsw_notice_date: dateMatch ? dateMatch[1].trim() : null,
      fsr_from_pdf: fsrMatch ? parseFloat(fsrMatch[1]) : null,
      concession_mentions: [],
      heritage_mentions: [],
      multiple_lots_in_report: [],
    };
  }

  async classifyAndExtractDocument(buf: Buffer, filename: string): Promise<{ document_type: string; [key: string]: unknown } | null> {
    try {
      const { text } = await new PDFParse({ data: buf }).getText();
      this.logger.log(`Parsing input document: ${filename} (${text.length} chars)`);

      const prompt = `You are parsing a document provided for an NSW land tax objection. Classify it and extract all relevant data.

Filename: ${filename}

Return JSON matching one of these schemas (no commentary, no markdown). Extract ALL dollar amounts as plain integers.

If LAND TAX ASSESSMENT NOTICE: { "document_type": "land_tax_notice", "owner": "string", "issue_date": "string", "properties": [{ "address": "string", "property_id": "string", "land_values": { "2024": number_or_null, "2025": number_or_null, "2026": number_or_null } }], "total_aggregated_value": number_or_null }
If BENCHMARK COMPONENT REPORT: { "document_type": "benchmark_report", "component": "string", "base_date": "string", "component_factor": number_or_null, "benchmarks": [], "sales": [{ "address": "string", "area_m2": number, "zone": "string", "analysed_land_value": number, "rate_per_m2": number, "contract_date": "string" }] }
If VALUATION SALES REPORT: { "document_type": "sales_report", "base_date": "string", "sales": [{ "address": "string", "area_m2": number, "zone": "string", "analysed_land_value": number, "rate_per_m2": number, "contract_date": "string" }] }
If none: { "document_type": "unknown" }

DOCUMENT TEXT:
${text}`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 3000,
        system: 'You are a document parser for NSW land tax objection documents. Return only valid JSON.',
        messages: [{ role: 'user', content: prompt }],
      });
      const textBlock = response.content.find((b) => b.type === 'text') as Anthropic.Messages.TextBlock | undefined;
      if (!textBlock?.text) return null;
      const raw = textBlock.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(raw) as { document_type: string; [key: string]: unknown };
    } catch (e: unknown) {
      this.logger.warn(`Failed to parse input document ${filename}: ${(e as Error).message}`);
      return null;
    }
  }
}
