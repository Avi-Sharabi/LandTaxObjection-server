import { promises as fs } from 'fs';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import * as nunjucks from 'nunjucks';
import { AnthropicService } from 'src/ai/anthropic.service';
import { SkillRegistryService } from 'src/mcp/skill-registry.service';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { AssessmentDocumentsService } from '../assessment-documents/assessment-documents.service';
import { PuppeteerService } from '../supporting-evidence/shared/puppeteer.service';
import { ValuationReportRepository } from './valuation-report.repository';
import { ValuationCtxCacheService } from './valuation-ctx-cache.service';
import { SupportingEvidenceContext } from '../supporting-evidence/supporting-evidence.types';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeObjectionReason } from './entities/dispute-objection-reason.entity';
import { ComparableSale } from '../comparables/entities/comparable-sale.entity';
import { DisputeEvidenceIssue } from '../supporting-evidence/entities/dispute-evidence-issue.entity';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';
import { DisputeCaseNotFoundException } from './exceptions/dispute-case-not-found.exception';
import { ValuationReportFailedException } from './exceptions/valuation-report-failed.exception';

const PLANNING_AREA_KEYS = new Set([
  'shape_area_m2', 'Shape_Area', 'SHAPE_Area', 'area_m2', 'area', 'Area', 'SHAPE_Length',
]);

export interface SafePlanningCtx {
  council?: string[];
  warn?: Array<{ title?: string; layerRef?: string }>;
  layers?: Array<{ layerName: string; results: Array<Record<string, unknown>> }>;
  heritage_mentions?: string[];
  concession_mentions?: string[];
  revenue_nsw_notice_date?: string | null;
  height_limit_m?: number | null;
  lot?: string;
  plan?: string;
  planType?: string;
  reportText?: string | null;
}

export function buildSafePlanningCtx(ctx: SupportingEvidenceContext): SafePlanningCtx {
  return {
    council: ctx.apiData.council,
    warn: ctx.apiData.warn,
    layers: (ctx.apiData.layers ?? []).map(l => ({
      layerName: l.layerName,
      results: l.results.map(r =>
        Object.fromEntries(
          Object.entries(r as Record<string, unknown>).filter(([k]) => !PLANNING_AREA_KEYS.has(k)),
        ),
      ),
    })),
    heritage_mentions: ctx.meta.heritage_mentions,
    concession_mentions: ctx.meta.concession_mentions,
    revenue_nsw_notice_date: ctx.meta.revenue_nsw_notice_date,
    height_limit_m: ctx.meta.height_limit_m,
    lot: ctx.meta.lot ?? undefined,
    plan: ctx.meta.plan ?? undefined,
    planType: ctx.meta.planType ?? undefined,
    reportText: ctx.reportText?.slice(0, 10000),
  };
}

interface RawReportData {
  meta?: Record<string, unknown>;
  property?: Record<string, unknown>;
  valuation?: { vg_recorded_value?: number; [k: string]: unknown };
  key_finding?: string;
  cover_facts?: Array<{ label: string; value: string }>;
  exec_summary?: { intro?: string; rows?: Array<{ item: string; finding: string }> };
  statutory?: { basis?: Array<{ label: string; value: string }>; assessment?: Array<{ label: string; value: string }> };
  subject?: { identification?: Array<{ label: string; value: string }>; attributes?: Array<{ label: string; value: string }>; development?: Array<{ label: string; value: string }> };
  planning_proposal?: { status_word?: string; critical_note?: string; rows?: Array<{ label: string; value: string }> };
  hbu?: { statement?: string };
  constraints?: Array<{ constraint: string; status: string; source: string; impact: string }>;
  cpv?: {
    section_title?: string;
    intro?: string;
    comp_title?: string;
    comp_intro?: string;
    methods?: Array<{ name: string; value: number; suffix?: string; adopted?: boolean; var_class?: string }>;
    extra_rows?: Array<{ label: string; value: string; note: string }>;
    comp_summary_row?: Record<string, string>;
    rate_analysis?: string;
  };
  comparables?: Array<{
    ref: string; address: string; date: string; zone: string; comparison: string;
    price?: number; price_display?: string; price_suffix?: string; highlight?: string;
    area_sqm?: number; area_display?: string;
    rate_per_sqm?: number; rate_display?: string;
  }>;
  residual?: { rows?: Array<{ label: string; value: string }> };
  weaknesses?: Array<{ n: string | number; weakness: string; evidence: string; argument: string }>;
  legal_grounds?: Array<{ label: string; value: string }>;
  financial_scenarios?: Array<{
    scenario: string; basis: string;
    taxable_value?: number; land_tax?: number;
    saving?: number | string; emph?: boolean;
  }>;
  financial_callouts?: Array<{ text: string; kind?: string }>;
  evidence_checklist?: Array<{ item: string; status: string; notes: string; status_class?: string }>;
  objection_narrative?: { intro?: string; paragraphs?: string[] };
  action_plan?: Array<{ priority: string | number; action: string; how: string; deadline: string; status: string; status_class?: string }>;
  disclaimer_paragraphs?: string[];
  payment_reminder?: string;
}

interface SkillFiles {
  dataSchema: string;
  sectionGuide: string;
  template: string;
}

@Injectable()
export class ValuationReportService {
  private readonly logger = new Logger(ValuationReportService.name);
  private skillFiles: SkillFiles | null = null;

  constructor(
    private readonly repository: ValuationReportRepository,
    private readonly anthropicService: AnthropicService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly azureBlobService: AzureBlobService,
    private readonly assessmentDocumentsService: AssessmentDocumentsService,
    private readonly puppeteerService: PuppeteerService,
    private readonly ctxCacheService: ValuationCtxCacheService,
  ) {}

  async generate(disputeCaseId: string, planningCtx?: SafePlanningCtx): Promise<void> {
    const disputeCase = await this.repository.findDisputeCaseWithRelations(disputeCaseId);
    if (!disputeCase) throw new DisputeCaseNotFoundException(disputeCaseId);

    const [comparables, evidenceIssues, objectionReasons, skillFiles] = await Promise.all([
      this.repository.getComparables(disputeCaseId),
      this.repository.getLatestEvidenceIssues(disputeCaseId),
      this.repository.getLatestObjectionReasons(disputeCaseId),
      this.loadSkillFiles(),
    ]);

    // When called from the regenerate endpoint (no planningCtx), restore from cache to avoid re-running the pipeline
    let resolvedCtx = planningCtx;
    if (!resolvedCtx) {
      const cached = await this.ctxCacheService.get(disputeCaseId);
      if (cached) resolvedCtx = buildSafePlanningCtx(cached);
    }

    const skillContent = this.skillRegistry.getSkillContent('valuation-report');
    const userMessage = this.buildUserMessage(disputeCase, comparables, evidenceIssues, objectionReasons, resolvedCtx);

    this.logger.log(JSON.stringify({ context: 'ValuationReport.calling_claude', disputeCaseId }));
    const result = await this.anthropicService.call({
      systemBlocks: [
        { text: skillContent, cached: true },
        { text: `# Data Schema — JSON output contract\n\n${skillFiles.dataSchema}`, cached: true },
        { text: skillFiles.sectionGuide, cached: true },
      ],
      userMessage,
      maxTokens: 32000,
      thinkingBudgetTokens: 4000,
    });

    if (!result.text) throw new ValuationReportFailedException('Claude returned empty valuation report');

    const raw = this.anthropicService.parseJsonObject<RawReportData>(result.text);
    const renderData = this.buildRenderData(raw);

    const html = nunjucks.renderString(skillFiles.template, renderData);

    const pdfBuffer = await this.renderToPdf(html);

    const blobPath = `analysis-reports/${disputeCaseId}/valuation-report.pdf`;
    const base64 = pdfBuffer.toString('base64');
    const storedPath = await this.azureBlobService.uploadFile(blobPath, base64);
    if (!storedPath) throw new ValuationReportFailedException('Azure Blob upload returned null path for valuation report');

    await this.assessmentDocumentsService.createArtifactRecord(
      disputeCase.client_id,
      'valuation-report.pdf',
      storedPath,
    );

    await this.repository.updateAnalysisReportPath(disputeCaseId, storedPath);

    this.logger.log(JSON.stringify({
      context: 'ValuationReport.complete',
      disputeCaseId,
      blobPath: storedPath,
      usage: result.usage,
    }));
  }

  private async loadSkillFiles(): Promise<SkillFiles> {
    if (this.skillFiles) return this.skillFiles;
    const base = join(__dirname, '..', '..', 'skills', 'valuation');
    const [dataSchema, sectionGuide, template] = await Promise.all([
      fs.readFile(join(base, 'data_schema.md'), 'utf-8'),
      fs.readFile(join(base, 'section_guide.md'), 'utf-8'),
      fs.readFile(join(base, 'report_template.html.j2'), 'utf-8'),
    ]);
    this.skillFiles = { dataSchema, sectionGuide, template };
    return this.skillFiles;
  }

  private buildRenderData(raw: RawReportData): Record<string, unknown> {
    const vgValue = raw.valuation?.vg_recorded_value ?? 0;

    const valuation = {
      ...raw.valuation,
      vg_recorded_display: this.formatMoney(vgValue),
      // vg_recorded_short is passed through from Claude (e.g. "$20.8M") for the 5.1 column header
    };

    const methodRows = (raw.cpv?.methods ?? []).filter(m => typeof m.value === 'number' && isFinite(m.value)).map(m => {
      const diff = vgValue - m.value;
      const pct = vgValue > 0 ? (diff / vgValue) * 100 : 0;
      let varDisplay: string;
      if (diff > 0) {
        varDisplay = `${this.formatMoney(diff)} BELOW VG (-${pct.toFixed(1)}%)`;
      } else {
        varDisplay = `${this.formatMoney(Math.abs(diff))} ABOVE VG (+${Math.abs(pct).toFixed(1)}%)`;
      }
      const varClass = m.var_class ?? (pct >= 50 ? 'v-strong' : pct >= 25 ? 'v-mod' : '');
      return {
        name: m.name,
        adopted: m.adopted ?? false,
        value_display: this.formatMoney(m.value) + (m.suffix ? ` (${m.suffix})` : ''),
        var_display: varDisplay,
        var_class: varClass,
      };
    });

    const cpv = raw.cpv ? {
      ...raw.cpv,
      method_rows: methodRows,
    } : undefined;

    const comparables = (raw.comparables ?? []).map(c => {
      const priceBase = this.formatMoney(c.price ?? 0);
      const priceSuffix = c.price_suffix ? ` ${c.price_suffix}` : '';
      const areaNum = c.area_sqm ?? 0;
      const rateNum = c.rate_per_sqm ?? (c.price && areaNum ? Math.round(c.price / areaNum) : 0);
      return {
        ...c,
        price_display: c.price_display ?? (priceBase + priceSuffix),
        area_display: c.area_display ?? `${areaNum.toLocaleString('en-AU')} m²`,
        rate_display: c.rate_display ?? (rateNum ? `$${Math.round(rateNum).toLocaleString('en-AU')}` : ''),
        price_class: c.highlight === 'green' ? 'txt-green' : 'num',
      };
    });

    const financialScenarios = (raw.financial_scenarios ?? []).map(s => {
      const taxable = typeof s.taxable_value === 'number' && isFinite(s.taxable_value) ? s.taxable_value : null;
      const tax = typeof s.land_tax === 'number' && isFinite(s.land_tax) ? s.land_tax : null;
      const savingIsNum = typeof s.saving === 'number' && isFinite(s.saving as number);
      return {
        ...s,
        taxable_display: taxable != null ? this.formatMoney(taxable) : 'UNCONFIRMED',
        tax_display: tax != null ? this.formatMoney(tax) : 'UNCONFIRMED',
        saving_display: savingIsNum ? `~${this.formatMoney(s.saving as number)}` : (s.saving ?? ''),
        saving_class: savingIsNum ? 'txt-green' : '',
      };
    });

    const evidenceChecklist = (raw.evidence_checklist ?? []).map(e => ({
      ...e,
      status_class: e.status_class ?? this.deriveStatusClass(e.status),
    }));

    const actionPlan = (raw.action_plan ?? []).map(a => ({
      ...a,
      status_class: a.status_class ?? this.deriveStatusClass(a.status),
    }));

    return {
      ...raw,
      valuation,
      cpv,
      comparables,
      financial_scenarios: financialScenarios,
      evidence_checklist: evidenceChecklist,
      action_plan: actionPlan,
    };
  }

  private deriveStatusClass(status: string): string {
    if (!status) return '';
    const s = status.toUpperCase();
    if (/URGENT|LODGE/.test(s) || s === 'DUE') return 'st-urgent';
    if (/\bPENDING\b/.test(s)) return 'st-pending';
    if (/\b(CONFIRMED|AVAILABLE|TARGET|DONE)\b/.test(s)) return 'st-ok';
    return '';
  }

  private formatMoney(n: number): string {
    return '$' + Math.round(n).toLocaleString('en-AU');
  }

  private async renderToPdf(html: string): Promise<Buffer> {
    const browser = await this.puppeteerService.launchForPdf();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
      const pdf = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '25mm', right: '19mm', bottom: '22mm', left: '19mm' },
      });
      await page.close().catch(() => {});
      return Buffer.from(pdf);
    } finally {
      await browser.close().catch(() => {});
    }
  }

  private buildUserMessage(
    disputeCase: DisputeCase,
    comparables: ComparableSale[],
    evidenceIssues: DisputeEvidenceIssue[],
    objectionReasons: DisputeObjectionReason[],
    planningCtx?: SafePlanningCtx,
  ): string {
    const prop = disputeCase.property;
    const notice = disputeCase.valuation_notice as ValuationNotice | undefined;

    const lines: string[] = [
      '## Case Reference',
      disputeCase.case_reference,
      '',
      '## Property Identification',
      `Address: ${prop.address}`,
      `Property ID: ${prop.pid ?? 'unknown'}`,
      `Site area: ${prop.land_area_sqm ?? 'unknown'} m²`,
    ];

    if (prop.zoning) lines.push(`Zoning: ${prop.zoning}`);
    if (prop.height_limit_m != null) lines.push(`Height limit: ${prop.height_limit_m} m`);
    if (disputeCase.flag_heritage) lines.push('Heritage flag: YES');
    if (disputeCase.flag_flood_zone) lines.push('Flood zone flag: YES');
    if (disputeCase.flag_zoning) lines.push('Zoning issue flag: YES');
    if (disputeCase.flag_easement) lines.push('Easement flag: YES');
    if (disputeCase.flag_environmental) lines.push('Environmental flag: YES');

    if (planningCtx?.council?.length) {
      lines.push(`Council: ${planningCtx.council.join(', ')}`);
    }
    if (!prop.height_limit_m && planningCtx?.height_limit_m != null) {
      lines.push(`Height limit: ${planningCtx.height_limit_m} m`);
    }
    if (planningCtx?.revenue_nsw_notice_date) {
      lines.push(`Revenue NSW notice date: ${planningCtx.revenue_nsw_notice_date}`);
    }
    if (planningCtx?.heritage_mentions?.length) {
      lines.push(`Heritage mentions: ${planningCtx.heritage_mentions.join('; ')}`);
    }
    if (planningCtx?.concession_mentions?.length) {
      lines.push(`Concession mentions: ${planningCtx.concession_mentions.join('; ')}`);
    }

    if (planningCtx?.warn?.length) {
      lines.push('', '## ePlanning Warnings');
      for (const w of planningCtx.warn) {
        lines.push(`- ${w.title ?? w.layerRef ?? 'unknown'}`);
      }
    }

    const planningLayers = (planningCtx?.layers ?? []).filter(
      l => l.layerName !== 'Land Zoning Map' && l.results?.length > 0,
    );
    if (planningLayers.length > 0) {
      lines.push('', '## ePlanning Planning Controls & Constraints');
      for (const layer of planningLayers) {
        lines.push(`### ${layer.layerName}`);
        lines.push(JSON.stringify(layer.results).slice(0, 600));
      }
    }

    if (planningCtx?.reportText) {
      lines.push('', '## ePlanning Property Report (extracted text)');
      lines.push(planningCtx.reportText);
    }

    if (notice) {
      lines.push('', '## Valuation Notice');
      if (notice.notice_reference) lines.push(`Notice reference: ${notice.notice_reference}`);
      if (notice.valuation_date) {
        lines.push(`Relevant valuation date: ${new Date(notice.valuation_date).toISOString().split('T')[0]}`);
      }
      if (disputeCase.statutory_deadline) {
        lines.push(`Statutory deadline: ${new Date(disputeCase.statutory_deadline).toISOString().split('T')[0]}`);
      }
      if (notice.assessed_land_value != null) {
        lines.push(`Assessed land value (current year): $${notice.assessed_land_value.toLocaleString()}`);
      }
      if (notice.prior_land_value != null) {
        lines.push(`Prior year land value: $${notice.prior_land_value.toLocaleString()}`);
      }
      if (notice.land_value_2yr_prior != null) {
        lines.push(`Land value 2yr prior: $${notice.land_value_2yr_prior.toLocaleString()}`);
      }
      if (notice.ownership_type) lines.push(`Ownership type: ${notice.ownership_type}`);
      if (notice.benchmark_uplift_pct != null) lines.push(`Benchmark uplift: ${notice.benchmark_uplift_pct}%`);
      if (notice.appraised_value != null) {
        lines.push(`Independent appraised value: $${notice.appraised_value.toLocaleString()}`);
      }
    }

    const tickedIssues = evidenceIssues.filter(e => e.is_tick);
    if (tickedIssues.length > 0) {
      lines.push('', '## Supporting Evidence Issues (ticked)');
      for (const issue of tickedIssues) {
        lines.push(`- ${issue.issue_type} (confidence: ${issue.confidence ?? 'unknown'})`);
      }
    }

    if (comparables.length > 0) {
      lines.push('', '## Comparable Sales (AI-Analysed)');
      lines.push('| Address | Area m² | Zone | Adj. Land Value | $/m² | Contract Date |');
      lines.push('|---|---|---|---|---|---|');
      for (const c of comparables) {
        const address = [c.property_house_number, c.property_street_name, c.property_locality].filter(Boolean).join(' ');
        const rate = c.adjusted_rate_per_sqm != null ? `$${Number(c.adjusted_rate_per_sqm).toFixed(0)}` : '';
        const date = c.contract_date?.toISOString().split('T')[0] ?? '';
        const value = c.adjusted_land_value != null ? `$${Number(c.adjusted_land_value).toLocaleString()}` : '';
        lines.push(`| ${address} | ${c.area ?? ''} | ${c.zoning ?? ''} | ${value} | ${rate} | ${date} |`);
      }
    }

    if (objectionReasons.length > 0) {
      lines.push('', '## Objection Grounds');
      for (const r of objectionReasons) {
        const status = r.is_tick ? '✓ TICKED' : '✗ not ticked';
        lines.push(`Ground ${r.ground_number}: ${r.label} [${status}]`);
        if (r.concession_type) lines.push(`  Concession type: ${r.concession_type}`);
        if (r.concession_type_note) lines.push(`  Concession note: ${r.concession_type_note}`);
      }
    }

    lines.push(
      '',
      '---',
      'Using the skill, data schema, and section guide above, produce a single JSON object matching the data_schema.md schema.',
      'Wrap it in a ```json code fence. Return only the JSON — no other text or commentary.',
      'Provide raw numbers for money/area/rate fields. Omit sections where data is not available rather than guessing.',
      'Mark any unconfirmed figures as the string "UNCONFIRMED" in the relevant value field.',
      'Exception: for financial_scenarios[].taxable_value and .land_tax, use null (not "UNCONFIRMED") when values are unknown.',
      'Write all prose fields (exec_summary.intro, objection_narrative paragraphs, cpv.rate_analysis, weakness argument values, hbu.statement) in a confident first-person advocate voice: "We contend...", "We submit...", "The VG has failed to...". Do NOT use neutral third-person language.',
    );

    return lines.join('\n');
  }
}
