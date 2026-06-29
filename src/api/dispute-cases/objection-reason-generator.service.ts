import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { mkdir, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DisputeObjectionReason } from './entities/dispute-objection-reason.entity';
import { DisputeCase } from './entities/dispute-case.entity';
import { Property } from '../properties/entities/property.entity';
import { ObjectionReasonMarkdownService, NavigationSource } from './objection-reason-markdown.service';
import { ObjectionReasonBrowserService } from './objection-reason-browser.service';
import { PuppeteerService } from '../supporting-evidence/shared/puppeteer.service';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { AssessmentDocumentsService } from '../assessment-documents/assessment-documents.service';
import { SupportingEvidenceContext, IssueResult } from '../supporting-evidence/supporting-evidence.types';

const TERMINAL_PATTERNS: Array<[RegExp, string]> = [
  [/login wall|login\/register|requires (login|authentication|credentials)|login page/i, 'login wall'],
  [/IBM WebSphere|not rendering|shadow DOM|not accessible to the automation/i, 'broken DOM'],
  [/Max iterations reached/i, 'max iterations'],
  [/Cloudflare|bot.?detection|security.?verification/i, 'Cloudflare'],
];

const GROUND_LABELS: Record<number, string> = {
  1: 'My land value is too high',
  2: 'My land value is too low',
  3: 'The area or dimensions of the land are incorrect',
  4: 'The description of the land is incorrect',
  5: 'This land should have been valued separately',
  6: 'This land should have been valued with other land',
  7: 'The person on my notice does not own, lease or occupy the land',
  8: 'The valuations are incorrectly apportioned',
  9: 'Concessions or allowances are incorrect or missing',
};

// Exact labels from the VG portal "Concession type" radio button list
const PORTAL_CONCESSION_TYPES = [
  'MDAF 14X - Mixed development apportionment factor',
  'MUAF 14BBA - Mixed use apportionment factor',
  'Section 62K - Land Tax allowance',
  'Section 585 - Attributable part',
  'Section 14F(4) - Coal allowance',
  'Section 14L(1)(A) - Onsite allowance',
  'Section 14L(1)(B) - Offsite allowance',
  'Section 14L(2) - Stratum allowance',
  'Section 14T - Subdividers allowance',
  'Section 124 - Heritage Act - Heritage value',
] as const;

interface ObjectionGround {
  groundNumber: number;
  label: string;
  isTick: boolean;
  analysis: string;
  evidenceDocIds: string[];
}

interface ObjectionPropertyDetails {
  address: string;
  pid: string;
  trustee: string;
  trust: string;
  lot: string;
  dp: string;
}

type DisputeCaseWithRelations = DisputeCase & {
  property: Property;
  client: { name: string } | null;
};

@Injectable()
export class ObjectionReasonGeneratorService {
  private readonly logger = new Logger(ObjectionReasonGeneratorService.name);

  constructor(
    @InjectRepository(DisputeObjectionReason)
    private readonly repo: Repository<DisputeObjectionReason>,
    @InjectRepository(DisputeCase)
    private readonly disputeCasesRepo: Repository<DisputeCase>,
    private readonly markdownService: ObjectionReasonMarkdownService,
    private readonly browserService: ObjectionReasonBrowserService,
    private readonly puppeteerSvc: PuppeteerService,
    private readonly azureBlobService: AzureBlobService,
    private readonly assessmentDocumentsService: AssessmentDocumentsService,
  ) {}

  /**
   * Step 1b — resource gathering phase.
   * Runs browser navigation (ABR/ASIC) early in the pipeline so that
   * entity facts are stored in ctx.entityEvidence and available to ALL
   * downstream steps (Step 4 concession analyser, Step 5 generator).
   */
  async gatherEntityEvidence(
    disputeCaseId: string,
    ctx: SupportingEvidenceContext,
  ): Promise<void> {
    const runId = Date.now();
    this.logger.log(`[ENTITY] Gathering entity evidence for case ${disputeCaseId}`);

    const disputeCase = await this.disputeCasesRepo.findOne({
      where: { id: disputeCaseId },
      relations: ['property', 'client'],
    }) as DisputeCaseWithRelations | null;

    if (!disputeCase) {
      this.logger.warn(`[ENTITY] Dispute case ${disputeCaseId} not found — skipping`);
      ctx.entityEvidence = { groundDocIds: {}, groundAnalysis: {}, clientName: '' };
      return;
    }

    const clientName = disputeCase.client?.name ?? '';
    const { sourcesMap, priorityOrder } = await this.markdownService.buildGuide(disputeCase);

    const groundSources = new Map<string, string[]>();
    for (const [name, source] of sourcesMap) {
      for (const g of source.grounds) {
        if (!groundSources.has(g)) groundSources.set(g, []);
        groundSources.get(g)!.push(name);
      }
    }

    const outputDir = join(tmpdir(), `entity-${disputeCaseId}-${runId}`);
    await mkdir(outputDir, { recursive: true });

    const browser = await this.puppeteerSvc.launch();

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    const groundDocIds: Record<string, string[]> = {};
    const groundAnalysis: Record<string, string> = {};
    const attemptedNames = new Set<string>();
    const coveredSubGrounds = new Set<string>();
    const queue = [...priorityOrder];

    const evidenceContext = this.buildGatheringContext(ctx);

    try {
      while (queue.length > 0) {
        const priorityName = queue.shift()!;
        const matchedName = this.markdownService.fuzzyMatch(priorityName, Array.from(sourcesMap.keys()));
        if (!matchedName) continue;

        const source = sourcesMap.get(matchedName)!;
        if (attemptedNames.has(matchedName)) continue;
        attemptedNames.add(matchedName);

        if (source.grounds.every(g => coveredSubGrounds.has(g))) continue;
        if (this.isTerminallyBlocked(source.difficultyLog)) continue;

        this.logger.log(`[ENTITY] ▶ ${matchedName}`);
        const result = await this.browserService.runSource(page, source, outputDir, evidenceContext);
        this.logger.log(`[ENTITY] ${matchedName} → success=${result.success} shots=${result.screenshotPaths.length} comment="${result.comment?.slice(0, 120) ?? result.error ?? ''}"`);

        if (result.success) {
          const noEvidence = this.isNegativeComment(result.comment);
          this.logger.log(`[ENTITY] ${matchedName} → noEvidence=${noEvidence}`);
          if (!noEvidence && result.screenshotPaths.length > 0) {
            const screenshotPath = result.screenshotPaths[0];
            const docId = await this.uploadScreenshot(screenshotPath, disputeCaseId, disputeCase.client_id);
            this.logger.log(`[ENTITY] upload → docId=${docId ?? 'null'}`);
            if (docId) {
              const groundNums = [...new Set(source.grounds.map(g => parseInt(g, 10)).filter(n => !isNaN(n)))];
              for (const num of groundNums) {
                const key = String(num);
                if (!groundDocIds[key]) groundDocIds[key] = [];
                groundDocIds[key].push(docId);
                if (result.comment) {
                  groundAnalysis[key] = (groundAnalysis[key] ? groundAnalysis[key] + '\n' : '') + result.comment;
                }
              }
              for (const sg of source.grounds) coveredSubGrounds.add(sg);
            }
            try { await unlink(screenshotPath); } catch { /* already gone */ }
          } else if (noEvidence) {
            for (const f of result.screenshotPaths) {
              try { await unlink(f); } catch { /* already gone */ }
            }
          }
        } else {
          this.logger.warn(`[ENTITY] ❌ ${matchedName} — ${result.error}`);
          const fallback = this.findNextFallback(source.grounds, groundSources, sourcesMap, attemptedNames);
          if (fallback) queue.unshift(fallback.name);
        }
      }
    } finally {
      await browser.close();
    }

    ctx.entityEvidence = { groundDocIds, groundAnalysis, clientName };
    this.logger.log(`[ENTITY] Done — ${Object.keys(groundDocIds).length} grounds with evidence`);
  }

  async generate(
    disputeCaseId: string,
    ctx: SupportingEvidenceContext,
  ): Promise<void> {
    const runId = Date.now();
    this.logger.log(`[OBJECTION] Starting generation for case ${disputeCaseId}`);

    const grounds = this.buildInitialGrounds();
    this.applyEntityEvidence(grounds, ctx);

    const clientName = ctx.entityEvidence?.clientName ?? '';
    const propertyDetails: ObjectionPropertyDetails = {
      address: ctx.confirmedAddress,
      pid: ctx.propId,
      trustee: clientName,
      trust: clientName,
      lot: ctx.meta.lot ?? '',
      dp: ctx.meta.plan ?? '',
    };

    const { concessionType, concessionNote } = await this.generateReasonTexts(grounds, propertyDetails, ctx);
    await this.persistGrounds(disputeCaseId, grounds, runId, concessionType, concessionNote);
  }

  async getObjectionReasons(disputeCaseId: string): Promise<DisputeObjectionReason[]> {
    const latest = await this.repo
      .createQueryBuilder('r')
      .select('MAX(r.run_id)', 'maxRunId')
      .where('r.dispute_case_id = :id', { id: disputeCaseId })
      .getRawOne<{ maxRunId: string }>();

    if (!latest?.maxRunId) return [];

    return this.repo.find({
      where: { dispute_case_id: disputeCaseId, run_id: parseInt(latest.maxRunId) },
      order: { ground_number: 'ASC' },
    });
  }

  // ─── Private orchestration helpers ─────────────────────────────────────────

  private applyEntityEvidence(grounds: ObjectionGround[], ctx: SupportingEvidenceContext): void {
    if (ctx.entityEvidence) {
      for (const g of grounds) {
        const key = String(g.groundNumber);
        const docIds = ctx.entityEvidence.groundDocIds[key] ?? [];
        const analysisText = ctx.entityEvidence.groundAnalysis[key] ?? '';
        if (docIds.length > 0 || analysisText) {
          if (!this.isNegativeTick(analysisText)) {
            g.isTick = true;
          }
          g.evidenceDocIds = [...docIds];
          g.analysis = analysisText;
        }
      }
    }

    const g1 = grounds.find(g => g.groundNumber === 1);
    const g2 = grounds.find(g => g.groundNumber === 2);
    const lotAreaForAutoTick = ctx.lotAreaM2 ?? ctx.meta.land_area_sqm;
    if (g1 && !g1.isTick && !(g2?.isTick) && ctx.inputComparables.length > 0 && lotAreaForAutoTick != null && lotAreaForAutoTick > 0) {
      g1.isTick = true;
      this.logger.log(`[OBJECTION] Ground 1 auto-ticked — ${ctx.inputComparables.length} comparable(s) in pipeline`);
    }
  }

  private async generateReasonTexts(
    grounds: ObjectionGround[],
    propertyDetails: ObjectionPropertyDetails,
    ctx: SupportingEvidenceContext,
  ): Promise<{ concessionType: string | null; concessionNote: string | null }> {
    const tickedGrounds = grounds.filter(g => g.isTick);
    const tickedGroundNumbers = tickedGrounds.map(g => g.groundNumber);

    for (const g of tickedGrounds) {
      if (g.evidenceDocIds.length > 1) {
        const synthesis = await this.browserService.synthesiseEvidence({
          groundNumber: g.groundNumber,
          label: g.label,
          evidenceFiles: g.evidenceDocIds,
          analysis: g.analysis,
        });
        if (synthesis?.bestFile && g.evidenceDocIds.includes(synthesis.bestFile)) {
          g.evidenceDocIds = [synthesis.bestFile];
          g.analysis = synthesis.analysis;
        }
      }

      this.logger.log(`[OBJECTION]   ✍  Generating reason text for Ground ${g.groundNumber}`);
      const generationCtx = this.buildGenerationContext(ctx, g.groundNumber, tickedGroundNumbers);
      const reason = await this.browserService.generateObjectionReason(
        { groundNumber: g.groundNumber, label: g.label, evidenceFiles: g.evidenceDocIds, analysis: g.analysis },
        propertyDetails,
        generationCtx,
      );
      if (reason) g.analysis = reason;
    }

    const g9 = grounds.find(g => g.groundNumber === 9);
    if (!g9?.isTick) return { concessionType: null, concessionNote: null };

    const result = await this.browserService.determineConcessionType(
      g9.analysis,
      ctx,
      PORTAL_CONCESSION_TYPES as unknown as string[],
    );
    return { concessionType: result.concessionType, concessionNote: result.note };
  }

  private async persistGrounds(
    disputeCaseId: string,
    grounds: ObjectionGround[],
    runId: number,
    concessionType: string | null,
    concessionNote: string | null,
  ): Promise<void> {
    const rows: Partial<DisputeObjectionReason>[] = grounds.map(g => ({
      dispute_case_id: disputeCaseId,
      ground_number: g.groundNumber,
      label: g.label,
      is_tick: g.isTick,
      concession_type: g.groundNumber === 9 ? concessionType : null,
      concession_type_note: g.groundNumber === 9 ? concessionNote : null,
      analysis: g.analysis || null,
      evidence_files: g.evidenceDocIds.length > 0 ? g.evidenceDocIds : null,
      run_id: runId,
    }));

    await this.repo.save(rows);
    this.logger.log(`[OBJECTION] Saved ${rows.length} ground rows for case ${disputeCaseId}`);
  }

  // ─── Utility helpers ────────────────────────────────────────────────────────

  private buildInitialGrounds(): ObjectionGround[] {
    return Array.from({ length: 9 }, (_, i) => ({
      groundNumber: i + 1,
      label: GROUND_LABELS[i + 1] ?? `Ground ${i + 1}`,
      isTick: false,
      analysis: '',
      evidenceDocIds: [] as string[],
    }));
  }

  private async uploadScreenshot(
    filePath: string,
    disputeCaseId: string,
    clientId: string,
  ): Promise<string | null> {
    try {
      const buffer = await readFile(filePath);
      const base64 = buffer.toString('base64');
      const filename = filePath.split(/[\\/]/).pop()!;
      const blobPath = `objection-reasons/${disputeCaseId}/${filename}`;
      const storedPath = await this.azureBlobService.uploadFile(blobPath, base64);
      if (!storedPath) return null;
      const doc = await this.assessmentDocumentsService.createArtifactRecord(clientId, filename, storedPath);
      return doc.id;
    } catch (err: unknown) {
      this.logger.warn(`[OBJECTION] Failed to upload screenshot ${filePath}: ${(err as Error).message}`);
      return null;
    }
  }

  private findNextFallback(
    grounds: string[],
    groundSources: Map<string, string[]>,
    sourcesMap: Map<string, NavigationSource>,
    attemptedNames: Set<string>,
  ): NavigationSource | null {
    for (const ground of grounds) {
      const candidates = groundSources.get(ground) ?? [];
      for (const candidateName of candidates) {
        if (attemptedNames.has(candidateName)) continue;
        const matched = this.markdownService.fuzzyMatch(candidateName, Array.from(sourcesMap.keys()));
        if (matched && !attemptedNames.has(matched)) return sourcesMap.get(matched) ?? null;
      }
    }
    return null;
  }

  private buildGatheringContext(ctx: SupportingEvidenceContext): string {
    const lines: string[] = [
      `Property: ${ctx.confirmedAddress} (PID ${ctx.propId})`,
      `Lot area: ${ctx.lotAreaM2 ?? 'unknown'} m²`,
      `Zoning layers: ${ctx.apiData.layers.map(l => l.layerName).join(', ') || 'none'}`,
    ];

    if (ctx.landTaxNotice) {
      lines.push('', 'Land tax notice:');
      if (ctx.landTaxNotice.owner) lines.push(`  Owner: ${ctx.landTaxNotice.owner}`);
      if (ctx.landTaxNotice.issue_date) lines.push(`  Issue date: ${ctx.landTaxNotice.issue_date}`);
      if (ctx.landTaxNotice.total_aggregated_value != null) {
        lines.push(`  Total aggregated value: $${ctx.landTaxNotice.total_aggregated_value.toLocaleString()}`);
      }
      for (const prop of (ctx.landTaxNotice.properties ?? []).slice(0, 3)) {
        const vals = Object.entries(prop.land_values ?? {}).map(([yr, v]) => `${yr}: $${v.toLocaleString()}`).join(', ');
        lines.push(`  Property: ${prop.address}${vals ? ` — ${vals}` : ''}`);
      }
    }

    if (ctx.inputBenchmarkReport) {
      const br = ctx.inputBenchmarkReport;
      lines.push('', `Benchmark report: base date ${br.base_date ?? 'unknown'}, component factor ${br.component_factor ?? 'unknown'}`);
    }

    if (ctx.inputDocumentsText.length > 0) {
      lines.push('', 'Uploaded documents (extract):');
      for (const text of ctx.inputDocumentsText) {
        const snippet = text.trim().slice(0, 800);
        lines.push(snippet + (text.length > 800 ? ' [truncated]' : ''));
        lines.push('---');
      }
    }

    return lines.join('\n');
  }

  private formatIssueResult(label: string, issue: IssueResult | null): string {
    if (!issue || !issue.tick) return '';
    const parts = [`${label} (confidence: ${issue.confidence}):`];
    if (issue.trigger) parts.push(`  Trigger: ${issue.trigger}`);
    if (issue.text_box_content) parts.push(`  Finding: ${issue.text_box_content}`);
    return parts.join('\n');
  }

  private buildGenerationContext(ctx: SupportingEvidenceContext, groundNumber: number, tickedGroundNumbers: number[] = []): string {
    const lines: string[] = [];
    const er = ctx.evidenceResult;

    if (tickedGroundNumbers.length > 1) {
      const allGroundDescriptions = tickedGroundNumbers
        .map(n => `Ground ${n} — ${GROUND_LABELS[n] ?? `Ground ${n}`}`)
        .join('; ');
      lines.push(
        `CROSS-GROUND NOTICE: This objection raises MULTIPLE grounds simultaneously: ${allGroundDescriptions}. ` +
        `When writing the text for Ground ${groundNumber}, you MUST explicitly name ALL of the following grounds by number and official label: ${allGroundDescriptions}. ` +
        `You MUST separately and fully argue the specific merits of Ground ${groundNumber} on its own terms. Naming the other grounds is required but is NOT sufficient — Ground ${groundNumber} must stand alone as a complete, self-contained argument addressing its own specific facts and evidence.`,
      );
    }

    const zoningLayer = ctx.apiData.layers.find(l => l.layerName === 'Land Zoning Map');
    const zoningCode = zoningLayer?.results?.[0]?.['Zone'] as string | undefined;
    const zoningLabel = zoningLayer?.results?.[0]?.['Zone Label'] as string | undefined;
    const zoningFull = zoningCode && zoningLabel ? `${zoningCode} ${zoningLabel}` : zoningCode;

    const comparableLines = ctx.inputComparables.slice(0, 5).map(c => {
      const rate = c.rate_per_m2 != null ? Number(c.rate_per_m2) : null;
      return `  ${c.address}: area ${c.area_m2} m², adjusted value $${c.analysed_land_value.toLocaleString()}${rate != null && !isNaN(rate) ? `, $${rate.toFixed(0)}/m²` : ''}${c.contract_date ? `, sold ${c.contract_date}` : ''}`;
    });

    switch (groundNumber) {
      case 1:
      case 2: {
        const assessedValue = ctx.meta.assessed_land_value;
        const lotArea = ctx.lotAreaM2 ?? ctx.meta.land_area_sqm;
        if (assessedValue != null) lines.push(`Assessed land value (notice): $${assessedValue.toLocaleString()}`);
        if (lotArea != null) lines.push(`Lot area: ${lotArea} m²`);
        if (assessedValue != null && lotArea != null && lotArea > 0) {
          lines.push(`Assessed rate: $${Math.round(assessedValue / lotArea).toLocaleString()}/m²`);
        }
        if (ctx.meta.fsr_from_pdf != null) lines.push(`FSR (from report): ${ctx.meta.fsr_from_pdf}`);
        if (ctx.meta.height_limit_m != null) lines.push(`Height limit: ${ctx.meta.height_limit_m} m`);
        if (zoningFull) lines.push(`Zone: ${zoningFull}`);
        if (comparableLines.length > 0) { lines.push('Comparable sales:'); lines.push(...comparableLines); }
        if (groundNumber === 1 && er) {
          for (const fmt of [
            this.formatIssueResult('Planning constraints', er.issues.planning),
            this.formatIssueResult('Environmental impacts', er.issues.environmental),
            this.formatIssueResult('Access constraints', er.issues.access_constraints),
          ]) { if (fmt) lines.push(fmt); }
        }
        if (ctx.meta.concession_mentions.length > 0) {
          lines.push('Concession/planning mentions from report:');
          ctx.meta.concession_mentions.forEach(m => lines.push(`  - ${m}`));
        }
        if (groundNumber === 2 && ctx.meta.heritage_mentions.length > 0) {
          lines.push('Heritage mentions from report:');
          ctx.meta.heritage_mentions.forEach(m => lines.push(`  - ${m}`));
        }
        const docSnippet12 = ctx.inputDocumentsText?.[0];
        if (docSnippet12) lines.push(`Document evidence: ${docSnippet12.slice(0, 400)}`);
        if (!lotArea || lotArea === 0) {
          lines.push('WARNING: Land area is null/zero — cannot calculate $/m² rate or argued value without it. Explicitly state the land area is missing and must be obtained from the current title or deposited plan.');
        }
        break;
      }
      case 3: {
        lines.push(`Lot area from cadastre/API: ${ctx.lotAreaM2 ?? 'unknown'} m²`);
        lines.push(`Lot area from PDF report: ${ctx.meta.land_area_sqm ?? 'unknown'} m²`);
        lines.push(`Lot: ${ctx.meta.lot ?? 'unknown'}, Plan: ${ctx.meta.planType} ${ctx.meta.plan ?? 'unknown'}`);
        break;
      }
      case 4: {
        if (zoningFull) lines.push(`Zone from ePlanning: ${zoningFull}`);
        if (ctx.meta.heritage_mentions.length > 0) {
          lines.push('Heritage mentions from report:');
          ctx.meta.heritage_mentions.forEach(m => lines.push(`  - ${m}`));
        }
        if (er) { const fmt = this.formatIssueResult('Heritage analysis', er.issues.heritage); if (fmt) lines.push(fmt); }
        break;
      }
      case 5: {
        if (ctx.meta.multiple_lots_in_report.length > 0) {
          lines.push('Multiple lots referenced in report:');
          ctx.meta.multiple_lots_in_report.forEach(l => lines.push(`  - ${l}`));
        }
        if (er?.issues.grouping) {
          const vs = er.issues.grouping.valued_separately;
          if (vs?.tick) {
            if (vs.trigger) lines.push(`Grouping (valued separately) trigger: ${vs.trigger}`);
            if (vs.text_box_content) lines.push(`Grouping finding: ${vs.text_box_content}`);
          }
        }
        break;
      }
      case 6: {
        if (ctx.meta.multiple_lots_in_report.length > 0) {
          lines.push('Multiple lots referenced in report:');
          ctx.meta.multiple_lots_in_report.forEach(l => lines.push(`  - ${l}`));
        }
        if (er?.issues.grouping) {
          const vt = er.issues.grouping.valued_together;
          if (vt?.tick) {
            if (vt.trigger) lines.push(`Grouping (valued together) trigger: ${vt.trigger}`);
            if (vt.text_box_content) lines.push(`Grouping finding: ${vt.text_box_content}`);
          }
        }
        for (const prop of (ctx.landTaxNotice?.properties ?? []).slice(0, 5)) {
          lines.push(`Notice property: ${prop.address}`);
        }
        break;
      }
      case 7: {
        lines.push(`Owner on land tax notice: ${ctx.landTaxNotice?.owner ?? 'not available'}`);
        lines.push(`Entity evidence client name: ${ctx.entityEvidence?.clientName ?? 'not available'}`);
        break;
      }
      case 8: {
        if (ctx.meta.assessed_land_value != null) lines.push(`Assessed land value (notice): $${ctx.meta.assessed_land_value.toLocaleString()}`);
        for (const prop of (ctx.landTaxNotice?.properties ?? []).slice(0, 5)) {
          const vals = Object.entries(prop.land_values ?? {}).map(([yr, v]) => `${yr}: $${v.toLocaleString()}`).join(', ');
          lines.push(`Notice property: ${prop.address}${vals ? ` — ${vals}` : ''}`);
        }
        if (er) { const fmt = this.formatIssueResult('Apportionment analysis', er.issues.apportionment); if (fmt) lines.push(fmt); }
        break;
      }
      case 9: {
        if (ctx.meta.assessed_land_value != null) lines.push(`Assessed land value (notice): $${ctx.meta.assessed_land_value.toLocaleString()}`);
        if (ctx.meta.concession_mentions.length > 0) {
          lines.push('Concession mentions from report:');
          ctx.meta.concession_mentions.forEach(m => lines.push(`  - ${m}`));
        }
        if (er) { const fmt = this.formatIssueResult('Concession analysis', er.issues.concession); if (fmt) lines.push(fmt); }
        const docSnippet9 = ctx.inputDocumentsText?.[0];
        if (docSnippet9) lines.push(`Document evidence: ${docSnippet9.slice(0, 400)}`);
        break;
      }
    }

    return lines.join('\n');
  }

  private isNegativeTick(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();
    return (
      lower.includes('must not be ticked') ||
      lower.includes('must not tick') ||
      lower.includes('not be ticked') ||
      lower.includes('should not be ticked') ||
      lower.includes('do not tick') ||
      lower.includes('r5 must not') ||
      lower.includes('r9 must not')
    );
  }

  private isNegativeComment(comment: string | null): boolean {
    if (!comment) return true;
    const c = comment.toLowerCase();
    return (
      c.startsWith('no evidence') ||
      c.includes('unable to') ||
      c.includes('could not') ||
      c.includes('cannot ') ||
      c.includes('not render') ||
      c.includes('did not render') ||
      c.includes('not accessible') ||
      c.includes('not available') ||
      c.includes('page not found') ||
      c.includes('404') ||
      c.includes('login') ||
      c.includes('blocked') ||
      c.includes('no matching') ||
      c.includes('no results') ||
      c.includes('no data') ||
      c.includes('failed')
    );
  }

  private isTerminallyBlocked(difficultyLog: string): boolean {
    if (!difficultyLog) return false;
    return TERMINAL_PATTERNS.some(([pattern]) => pattern.test(difficultyLog));
  }
}
