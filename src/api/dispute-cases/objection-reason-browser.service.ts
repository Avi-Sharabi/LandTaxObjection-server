import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Page } from 'puppeteer';
import { NavigationSource } from './objection-reason-markdown.service';

const MAX_STEPS = 15;

export interface RunSourceResult {
  success: boolean;
  screenshotPaths: string[];
  extractedData: Record<string, unknown>;
  learnedSteps: BrowserAction[];
  comment: string | null;
  failedAtStep: number | null;
  error: string | null;
}

interface BrowserAction {
  type: string;
  target?: string;
  value?: string;
  key?: string;
  url?: string;
  filename?: string;
  direction?: string;
  amount?: number;
  ms?: number;
  comment?: string;
  reason?: string;
  [key: string]: unknown;
}

interface GroundForSynthesis {
  groundNumber: number;
  label: string;
  evidenceFiles: string[];
  analysis: string;
}

@Injectable()
export class ObjectionReasonBrowserService implements OnModuleInit {
  private static readonly SNAPSHOT_CHAR_LIMIT = 6_000;
  private static readonly STEP_MAX_TOKENS = 512;
  private static readonly SYNTHESIS_MAX_TOKENS = 300;
  private static readonly OBJECTION_MAX_TOKENS = 1200;
  private static readonly CONCESSION_MAX_TOKENS = 200;

  private readonly logger = new Logger(ObjectionReasonBrowserService.name);
  private readonly client: Anthropic;
  private readonly model: string;
  private writingGuide = '';

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.getOrThrow<string>('ANTHROPIC_API_KEY');
    const baseURL = this.config.get<string>('ANTHROPIC_API_URL')?.replace(/\/v1\/messages\/?$/, '');
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
    this.model = this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6';
  }

  async onModuleInit(): Promise<void> {
    try {
      this.writingGuide = await readFile(
        join(__dirname, '..', '..', 'skills', 'objection-writing-guide.md'),
        'utf8',
      );
      this.logger.log('[OBJECTION] Loaded objection-writing-guide.md');
    } catch (err: unknown) {
      this.logger.warn(`[OBJECTION] Could not load objection-writing-guide.md: ${(err as Error).message}`);
    }
  }

  async runSource(
    page: Page,
    source: NavigationSource,
    outputDir: string,
    evidenceContext: string,
  ): Promise<RunSourceResult> {
    const steps = source.learnedSteps.length > 0 ? source.learnedSteps : source.steps;
    const systemPrompt = this.buildSystemPrompt(source, steps, source.purpose, source.expectedOutput, evidenceContext);

    const screenshotPaths: string[] = [];
    const extractedData: Record<string, unknown> = {};
    const learnedSteps: BrowserAction[] = [];
    const messages: { role: 'user' | 'assistant'; content: string }[] = [];

    this.logger.log(`  → navigating to ${source.url}`);

    try {
      await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (err: unknown) {
      return this.fail(0, `Failed to load ${source.url}: ${(err as Error).message}`);
    }

    for (let step = 1; step <= MAX_STEPS; step++) {
      let snapshot = '';
      let title = '';
      try {
        title = await page.title();
        const tree = await page.accessibility.snapshot({ interestingOnly: false });
        snapshot = JSON.stringify(tree, null, 2).slice(0, ObjectionReasonBrowserService.SNAPSHOT_CHAR_LIMIT);
      } catch (err: unknown) {
        snapshot = `(could not capture accessibility tree: ${(err as Error).message})`;
      }

      messages.push({
        role: 'user',
        content: `Step ${step}/${MAX_STEPS}\nPage title: ${title}\nAccessibility tree:\n${snapshot}`,
      });

      let action: BrowserAction | null = null;
      try {
        const response = await this.client.messages.create({
          model: this.model,
          system: systemPrompt,
          messages,
          max_tokens: ObjectionReasonBrowserService.STEP_MAX_TOKENS,
        });
        const text = response.content?.find(b => b.type === 'text')?.text ?? '';
        action = this.parseAction(text);
      } catch (err: unknown) {
        return this.fail(step, `Claude API error: ${(err as Error).message}`);
      }

      if (!action) {
        messages.push({ role: 'assistant', content: '(no valid action returned)' });
        continue;
      }

      messages.push({ role: 'assistant', content: JSON.stringify(action) });
      learnedSteps.push(action);

      const execResult = await this.executeAction(page, action, outputDir, screenshotPaths, extractedData);

      if (action.type === 'done') {
        return {
          success: true,
          screenshotPaths,
          extractedData,
          learnedSteps,
          comment: action.comment ?? execResult,
          failedAtStep: null,
          error: null,
        };
      }

      if (action.type === 'error') {
        return this.fail(step, action.reason ?? 'Agent signalled error');
      }

      messages.push({ role: 'user', content: `Action result: ${execResult}` });
    }

    return this.fail(MAX_STEPS, 'Max iterations reached without completing task');
  }

  async synthesiseEvidence(ground: GroundForSynthesis): Promise<{ bestFile: string; analysis: string } | null> {
    const items = ground.evidenceFiles.map((f, i) => `${i + 1}. ${f}`).join('\n');

    const prompt = `You are a legal analyst reviewing evidence for an NSW land tax objection.

Ground ${ground.groundNumber}: "${ground.label}"

Evidence files collected:
${items}

Agent analysis notes:
${ground.analysis}

Pick the single most relevant file for the portal submission. Prefer in this order:
1. ABR/ASIC record showing entity type as "Fixed Unit Trust" or "Unit Trust" — strongest direct evidence
2. Revenue NSW's own published position or test
3. NSW legislation (LTMA s3A, s9B)
4. Federal legislation (Corporations Act s9, ITAA s97)
5. Case law, comparative jurisdictions, procedural sources

Respond ONLY as JSON (no markdown, no extra text):
{"bestFile":"<exact filename from the list above>","analysis":"<2-3 sentences stating what the evidence establishes as a fact. Name the data source not the filename. Formal language.>"}`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        system: 'NSW land tax legal analyst. Return only the JSON requested.',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: ObjectionReasonBrowserService.SYNTHESIS_MAX_TOKENS,
      });
      const text = response.content?.find(b => b.type === 'text')?.text ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      return JSON.parse(match[0]) as { bestFile: string; analysis: string };
    } catch (err: unknown) {
      this.logger.error(`synthesiseEvidence failed for Ground ${ground.groundNumber}: ${(err as Error).message}`);
      return null;
    }
  }

  async generateObjectionReason(
    ground: GroundForSynthesis,
    property: { address: string; pid: string; trustee: string; trust: string; lot: string; dp: string },
    generationCtx?: string,
  ): Promise<string | null> {
    const GROUND_CONTEXT: Record<number, string> = {
      1: 'Ground 1 asserts that the assessed land value is too high. The reason must state the contended value, reference comparable sales (address, DP, sale date, sale price, adjusted land value), and explain how each comparable supports the contended figure.'
        + '\n\nCROSS-GROUND AREA CORRECTION: If another active ground\'s analysis establishes a corrected land area (e.g., Ground 3 identifies an area discrepancy), use ONLY that corrected area for all $/m² rate calculations in this ground. Never use VG\'s recorded area once a correction has been established by another ground\'s analysis in this same objection.'
        + '\n\nMISSING AREA SCENARIO: If the analysis notes state that land area is null, missing, or not recorded (e.g., "LAND AREA FIELD IS NULL"), you MUST: (1) state explicitly that the land area is not recorded in the VG database and is required to calculate the $/m² rate and argued land value; (2) state that no argued land value can be calculated without it; (3) request that the correct cadastral area be obtained from the current title search or deposited plan; (4) DO NOT substitute a comparable sale\'s lot area as a proxy — state this prohibition explicitly.',
      2: 'Ground 2 asserts that the assessed land value is too low. The reason must state the contended (higher) value, reference comparable sales, and explain the market evidence. If the analysis notes include compulsory acquisition context or a financial warning about increased land tax liability, include those. If the analysis notes mention a family law property settlement, co-owner buyout, or co-owner valuation context, include a sentence stating why an accurate current market valuation is essential for that purpose. HERITAGE CITATION (MANDATORY): If the analysis notes contain a heritage item number (e.g. I45, I123) and/or a Local Environmental Plan name (e.g. "Woollahra LEP 2014", "Woollahra Local Environmental Plan 2014"), you MUST include BOTH the exact heritage item number AND the exact LEP name verbatim in your objection text. This is non-negotiable — omitting either constitutes an incomplete objection.',
      3: 'Ground 3 asserts that the area or dimensions of the land recorded on the notice are incorrect. The reason must identify the discrepancy between the area on the notice and the area shown by the official source.',
      4: 'Ground 4 asserts that the description of the land (zone, classification) on the notice is incorrect. The reason must identify the correct zone/description from the official planning instrument.'
        + ' ZONING CITATION: When the analysis notes specify a zone code (e.g. \'E5 Heavy Industrial\') and a named LEP (e.g. \'Liverpool LEP 2008\'), include BOTH the zone code and the full LEP name verbatim in your text. Do not paraphrase or omit either.',
      5: 'Ground 5 asserts that lots have been wrongly grouped and should each be valued separately. '
        + 'Name each lot (Lot X DP XXXXXX) and its separate registered proprietor exactly as shown in the analysis notes. '
        + 'State that each lot holds its own Certificate of Title per NSW LRS. '
        + 'State explicitly that no amalgamation order exists. '
        + 'If owners are different legal entities, name each entity precisely (including ACN if mentioned). '
        + 'CRITICAL: These lots have DIFFERENT registered proprietors — NEVER use the words "same owner", "common owner", "single owner", or "same ownership" anywhere in your response, even in a negative or comparative context. '
        + 'Instead, always describe them as "separate registered proprietors" or "different registered proprietors". '
        + 'Do NOT write phrases like "not the same owner" or "unlike a same owner scenario" — simply avoid the word combination "same owner" entirely. '
        + 'When the analysis notes reference a NSW LRS title search or an ASIC entity search, you MUST cite both by their full name in the objection text: "NSW Land Registry Services" (NSW LRS) for title searches and "Australian Securities and Investments Commission" (ASIC) for entity searches.',
      6: 'Ground 6 asserts that lots should be valued as a single combined holding. '
        + 'Name each lot and confirm same owner (same registered proprietor) for all lots via NSW LRS — use the phrase "same owner". '
        + 'Explain the physical and legal basis for combined valuation from the analysis notes. '
        + 'Include the combined argued value and any water licence or development approval mentioned.',
      7: 'Ground 7 asserts that the person named on the notice is not the correct owner/lessee/occupier. '
        + 'The reason must identify the correct legal entity and reference the official register confirming it. '
        + 'If the correct proprietor is a trust or trustee, use the word "trust" or "trustee" to describe the entity structure. '
        + 'CRITICAL — DO NOT INVENT DATES: If the analysis notes state that any date (date of death, transfer date, or similar) is "NOT RECORDED", "BLANK", "MISSING", or "NULL", you must NEVER write that date in your text. Writing a date that is flagged as missing is a factual error. State explicitly that the date is not available and must be obtained (e.g. from a death certificate, probate document, or NSW LRS dealing number). Do NOT invent, estimate, approximate, or infer any missing date under any circumstances.',
      8: 'Ground 8 asserts that the valuations are incorrectly apportioned. '
        + 'Identify the apportionment error: state the VG\'s wrong basis and the correct basis (e.g. lot entitlements from the strata plan, lot area ratio from the deposited plan, or lease formula). '
        + 'Include the total scheme value, the VG-applied percentage or figure, the correct percentage or figure, and the resulting dollar overcharge. '
        + 'CONFLICT SCENARIO — If the analysis notes state that entitlement schedules conflict, that the conflict is unresolved, or that no resolution document or adjudication exists: (1) identify BOTH schedules with their exact entitlements as stated in the notes, (2) state explicitly that the conflict is unresolved and no resolution document exists, (3) state that a complete objection cannot be prepared until the conflict is resolved, (4) note that the 60-day deadline still applies. For conflict scenarios, cite both the Valuation of Land Act 1916 (NSW) and the Land Tax Management Act 1956 (NSW). Do NOT draft a complete objection or select one schedule over the other. (5) Do NOT name or suggest any external resolution body, adjudicator, or authority (such as NCAT, NSW Civil and Administrative Tribunal, Fair Trading, NSW Courts, or any similar body) unless it is explicitly named in the analysis notes — inventing a referral or escalation path is a hallucination.',
      9: 'CRITICAL OVERRIDE — PPR MISSING EVIDENCE: If the analysis notes state that a PPR (Principal Place of Residence) flag is set but evidence is missing (e.g. "NO supporting evidence is attached", "no statutory declaration", "no occupancy confirmation"), you MUST: (1) state the full assessed taxable value from the pipeline context WITHOUT any PPR reduction, (2) flag that the PPR exemption cannot be activated without supporting evidence, (3) list the specific missing evidence types from the notes (statutory declaration, council rates notice, occupancy confirmation, etc.), (4) request that the evidence be provided. Do NOT calculate or present any taxable value with PPR applied. Do NOT apply, estimate, or reference any PPR reduction under any circumstances. '
        + 'Ground 9 asserts that a concession or allowance has been incorrectly applied or is missing. '
        + 'State the specific concession type and its exact legislative section (e.g. s14L(1)(A), s14T, s585, s62K) exactly as it appears in the analysis notes. '
        + 'Cite the Land Tax Management Act 1956 (NSW) and the section number. '
        + 'Include all key figures: taxable value, allowance amount, overcharge. '
        + 'Reference the supporting document or register cited in the notes. '
        + 'Write 5–8 sentences — do not truncate at 3–5. '
        + 'Use exact figure formats from the notes ($X/m², dollar amounts with commas). '
        + 'Include ALL regulatory identifiers verbatim (SEPP numbers, mining lease ML numbers, construction certificate CC numbers, DA references, LEP names exactly as stated such as "Hilltops LEP 2021" or "Fairfield LEP 2013", EPA Site Audit Statement numbers in the format SAS/YYYY/NNNN). '
        + 'If the analysis notes state that a concession "should be REMOVED", "must be REMOVED", or "is no longer applicable", write the objection as a REMOVAL scenario: state that the concession has been wrongly applied, that its basis no longer exists (citing the specific evidence verbatim, including any EPA Site Audit Statement number in format SAS/YYYY/NNNN, its date, and the issuing authority NSW EPA when an SAS is mentioned), and request its removal. '
        + 'If the analysis notes state that a concession "has not been applied" or "should be ADDED", write the objection as an ADDITION scenario: state that the concession has not been applied and request that it be applied. '
        + 'For scenarios involving Section 124 Heritage Act 1977, also cite Valuation of Land Act 1916 (NSW) in addition to Land Tax Management Act 1956 (NSW). '
        + 'For scenarios where the context is compulsory acquisition by a government authority (Transport for NSW, Roads and Maritime Services, etc.), also cite Valuation of Land Act 1916 (NSW) since the land valuation underpins the compensation amount. '
        + 'Use "Onsite" and "Offsite" as single unhyphenated words. '
        + 'SECTION NUMBER ACCURACY — Do NOT hallucinate section numbers. Copy section numbers verbatim from the analysis notes. The valid concession sections under the Land Tax Management Act 1956 (NSW) are: s14L(1)(A) Onsite allowance, s14L(1)(B) Offsite allowance, s14L(2) Stratum allowance, s14T Subdividers allowance, s585 Attributable part, s62K Land Tax allowance, and s124 Heritage Act heritage value. Do NOT write s62A, s62B, or any section number not listed here unless it appears verbatim in the analysis notes.',
    };

    const groundCtx = GROUND_CONTEXT[ground.groundNumber] ?? `Ground ${ground.groundNumber}: "${ground.label}"`;

    const prompt = `You are drafting the "reason for objection" text for the NSW Valuer General (VG) portal for the following land tax objection.

PROPERTY: ${property.address} (PID ${property.pid}, Lot ${property.lot} DP ${property.dp})
ENTITY ON NOTICE: ${property.trustee} ATF ${property.trust}

GROUND ${ground.groundNumber}: "${ground.label}"
${groundCtx}

EVIDENCE FILES ATTACHED: ${ground.evidenceFiles.join(', ') || 'none'}

AGENT OBSERVATION NOTES (raw data found — use this to extract specific values):
${ground.analysis || '(none)'}
${generationCtx ? `\nADDITIONAL PIPELINE CONTEXT (comparable sales, zoning, notice details, prior issue analysis):\n${generationCtx}\n` : ''}
WRITING RULES — the VG portal text box expects:
1. First person as the objector ("I contend...", "The entity named on my notice...", "The land tax notice incorrectly...")
2. 5–8 sentences for Ground 9; 3–6 sentences for Grounds 1–8. Include all required figures and legislative references even at the expense of brevity.
3. Name the official source by its proper title (Australian Business Register, Land Tax Management Act 1956 (NSW), NSW Planning Portal) — never say "the screenshot", "the PNG", "the automation", "the agent"
4. Include specific values from the observation notes: ABN, entity type, zone code, area (m²), lot/DP, legislative section numbers, comparable land rates. Write rates as $X/m² with a forward slash (e.g., "$2,000/m²") — never as "per m²" or "per square metre".
5. End by stating clearly how the evidence supports the objection ground
6. Formal, professional tone appropriate for a statutory objection to a government body
7. Always cite the Valuation of Land Act 1916 (NSW) as the statutory basis for the land valuation (Grounds 1–8)
8. For Ground 9, always cite the Land Tax Management Act 1956 (NSW) and the specific section number of the concession from the analysis notes — do NOT cite the Valuation of Land Act for Ground 9. Exception 1: for Ground 9 scenarios involving Section 124 Heritage Act 1977 (NSW) heritage restrictions, ALSO cite Valuation of Land Act 1916 (NSW) — heritage directly affects the assessed land value. Exception 2: for Ground 9 scenarios where the context is compulsory acquisition by a government authority (Transport for NSW, Roads and Maritime Services, etc.), ALSO cite Valuation of Land Act 1916 (NSW) — the land valuation underpins the compensation amount.
9. If the scenario involves a change of registered proprietor, land tax liability, or Revenue NSW, also cite the Land Tax Management Act 1956 (NSW)
10. Never hyphenate "onsite" or "offsite" — write as single unhyphenated words.
11. Always include a sentence stating the 60-day objection deadline: for Grounds 1–8 cite the Valuation of Land Act 1916 (NSW) and state that this objection must be lodged within 60 days of the date of the valuation notice; for Ground 9 cite the Land Tax Management Act 1956 (NSW) and state that this objection must be lodged within 60 days of the date of the land tax assessment. Example: "I note that an objection under the Valuation of Land Act 1916 (NSW) must be lodged within 60 days of the date of the notice."
12. If the agent observation notes explicitly state that multiple grounds apply (e.g. "Both Ground 1 (value too high) and Ground 3 (area incorrect) apply"), explicitly name ALL applicable grounds by their number and official label in your text.
13. If the agent observation notes contain the phrase "must NOT apply", "AI must NOT", "must NOT use", or "DO NOT apply", treat it as an absolute prohibition. Do NOT apply, calculate with, or present as beneficial any prohibited item. If the prohibited item is an exemption or concession reduction (such as PPR or s62K): (a) use the FULL assessed taxable value from the pipeline context without any reduction from the prohibited item, (b) explicitly state that the prohibited item cannot be applied in the current circumstances and the reason given in the notes, (c) do NOT calculate or mention what the taxable value would be if the prohibited item were applied.
14. If the agent observation notes state that a conflict is "unresolved", "cannot be resolved", "no resolution document exists", or "a complete objection cannot be prepared", do NOT write a complete objection. Instead write a notice that: identifies both conflicting positions with their exact figures, states that the conflict is unresolved, and explicitly states that the objection cannot be completed until the conflict is resolved.

Return ONLY the text to paste into the portal text box — no preamble, no labels, no markdown.`;

    const guideSection = this.writingGuide
      ? `\n\nOBJECTION WRITING GUIDE — use the templates, field requirements, and golden rules in this guide:\n${this.writingGuide}`
      : '';

    try {
      const response = await this.client.messages.create({
        model: this.model,
        system: `You write NSW land tax objection reasons for the NSW Valuer General portal. Return only the portal text — plain prose, no metadata, no formatting.${guideSection}`,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: ObjectionReasonBrowserService.OBJECTION_MAX_TOKENS,
      });
      return response.content?.find(b => b.type === 'text')?.text?.trim() ?? null;
    } catch (err: unknown) {
      this.logger.error(`generateObjectionReason failed for Ground ${ground.groundNumber}: ${(err as Error).message}`);
      return null;
    }
  }

  async determineConcessionType(
    analysis: string,
    ctx: import('../supporting-evidence/supporting-evidence.types').SupportingEvidenceContext,
    portalTypes: string[],
  ): Promise<{ concessionType: string | null; note: string | null }> {
    const concessionIssue = ctx.evidenceResult?.issues?.concession;
    const contextLines = [
      `Property: ${ctx.confirmedAddress} (PID ${ctx.propId})`,
      `Zone: ${ctx.apiData.layers.find(l => l.layerName === 'Land Zoning Map')?.results?.[0]?.['Zone'] ?? 'unknown'}`,
      `Concession mentions in report: ${ctx.meta.concession_mentions.join('; ') || 'none'}`,
      concessionIssue?.trigger ? `Step 4 concession trigger: ${concessionIssue.trigger}` : '',
      concessionIssue?.text_box_content ? `Step 4 concession finding: ${concessionIssue.text_box_content}` : '',
      `Agent observation: ${analysis || 'none'}`,
    ].filter(Boolean).join('\n');

    const prompt = `You are advising on an NSW land tax objection lodged through the NSW Valuer General portal.

Ground 9 has been ticked: "Concessions or allowances are incorrect or missing."

The portal REQUIRES selecting exactly ONE of the following concession type radio buttons — a selection is mandatory and cannot be left blank:
${portalTypes.map((t, i) => `${i + 1}. ${t}`).join('\n')}

CASE CONTEXT:
${contextLines}

Select the CLOSEST matching option from the list. You MUST always return one of the exact labels above — never null.
Use the note field to flag if the match is imperfect or if additional action is required (e.g. escalate to Revenue NSW).

Respond ONLY as JSON (no markdown, no extra text):
{"concessionType":"<exact label from the list above>","note":"<brief note for the accountant, or null if no clarification needed>"}`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        system: 'NSW land tax adviser. Return only the JSON requested.',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: ObjectionReasonBrowserService.CONCESSION_MAX_TOKENS,
      });
      const text = response.content?.find(b => b.type === 'text')?.text ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return { concessionType: portalTypes[2], note: 'Auto-fallback — accountant to confirm correct portal option.' };
      const parsed = JSON.parse(match[0]) as { concessionType: string | null; note: string | null };
      // If Claude still returned null or an invalid value, fall back to Section 62K (most general land tax option)
      if (!parsed.concessionType || !portalTypes.includes(parsed.concessionType)) {
        parsed.note = `Closest option selected. Accountant to confirm. ${parsed.note ?? ''}`.trim();
        parsed.concessionType = portalTypes[2]; // Section 62K - Land Tax allowance
      }
      return parsed as { concessionType: string; note: string | null };
    } catch (err: unknown) {
      this.logger.error(`determineConcessionType failed: ${(err as Error).message}`);
      return { concessionType: portalTypes[2], note: 'Auto-fallback — accountant to confirm correct portal option.' };
    }
  }

  private buildSystemPrompt(
    source: NavigationSource,
    steps: string[],
    purpose: string,
    expectedOutput: string,
    evidenceContext: string,
  ): string {
    return `You are an analyst investigating whether the Valuer General (VG) made a mistake on an NSW land tax assessment.

PRIOR ANALYSIS CONTEXT (already gathered — use this to inform your navigation and commentary):
${evidenceContext}

SOURCE: ${source.name}
Grounds to check: ${source.grounds.join(', ')}
What to look for: ${purpose}
Expected output: ${expectedOutput}

YOUR JOB:
1. Follow the navigation steps below in order — complete ALL steps before deciding whether to screenshot
2. CRITICAL: If the steps say to type an address and search, you MUST do that BEFORE taking any screenshot.
3. Only after completing all navigation steps: decide — does this page show evidence for this property?
   YES → take ONE screenshot, emit done with a factual observation comment
   NO  → emit done WITHOUT any screenshot: {"type":"done","comment":"No evidence — <reason>"}

WRITING THE DONE COMMENT — factual findings only, no navigation steps:
  - State the specific data values visible on the page: entity name, ABN, entity type, active status, zone code, area (m²), lot/DP, etc.
  - Do NOT describe what you clicked, typed, or navigated — only what the page shows about this property
  - Do NOT use words like "screenshot", "page", "accessibility tree", "loaded", "captured"
  - 2–3 sentences maximum, present tense, factual

NAVIGATION STEPS — follow these exactly in order, do not skip or reorder:
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

RULES:
- Respond with EXACTLY ONE JSON object per turn — no prose, no markdown fences
- Screenshot filename: use ONLY the base name, system appends the date. Example: {"type":"screenshot","filename":"ground-9-abr-entity"}
- If you hit an unresolvable block (CAPTCHA, login wall, 404): {"type":"error","reason":"description"}

VALID ACTION TYPES:
{"type":"click","target":"<css selector or element description>"}
{"type":"type","target":"<element description>","value":"<text to type>"}
{"type":"select","target":"<element description>","value":"<option value>"}
{"type":"press","key":"<key name e.g. Enter>"}
{"type":"scroll","direction":"down","amount":500}
{"type":"wait","ms":2000}
{"type":"screenshot","filename":"<base-name>"}
{"type":"extract","key":"<data key>","value":"<data value>"}
{"type":"done","comment":"<what was found or why no evidence>"}
{"type":"error","reason":"<why it failed>"}`;
  }

  private async executeAction(
    page: Page,
    action: BrowserAction,
    outputDir: string,
    screenshotPaths: string[],
    extractedData: Record<string, unknown>,
  ): Promise<string> {
    try {
      switch (action.type) {
        case 'click': {
          const el = await this.resolveElement(page, action.target ?? '');
          if (!el) return `Element not found: ${action.target}`;
          await el.click();
          await this.delay(600);
          return `Clicked: ${action.target}`;
        }
        case 'type': {
          const el = await this.resolveElement(page, action.target ?? '');
          if (!el) return `Element not found: ${action.target}`;
          await el.click({ count: 3 });
          await page.keyboard.type(action.value ?? '', { delay: 50 });
          return `Typed "${action.value}" into: ${action.target}`;
        }
        case 'select': {
          const el = await this.resolveElement(page, action.target ?? '');
          if (!el) return `Element not found: ${action.target}`;
          const handle = el.asElement();
          if (handle) await handle.select(action.value ?? '');
          return `Selected "${action.value}" in: ${action.target}`;
        }
        case 'press': {
          await page.keyboard.press((action.key ?? 'Enter') as Parameters<typeof page.keyboard.press>[0]);
          await this.delay(600);
          return `Pressed: ${action.key}`;
        }
        case 'scroll': {
          const amount = action.amount ?? 500;
          const dir = action.direction === 'up' ? -amount : amount;
          await page.evaluate((y: number) => window.scrollBy(0, y), dir);
          await this.delay(300);
          return `Scrolled ${action.direction} by ${Math.abs(dir)}px`;
        }
        case 'wait': {
          const ms = Math.min(action.ms ?? 1000, 10_000);
          await this.delay(ms);
          return `Waited ${ms}ms`;
        }
        case 'screenshot': {
          if (screenshotPaths.length >= 1) {
            return 'Screenshot already taken — only ONE allowed per source. Emit {"type":"done","comment":"..."} now.';
          }
          const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const filename = (action.filename ?? 'screenshot') + '-' + date + '.png';
          const path = `${outputDir}/${filename}`;
          await page.screenshot({ path, fullPage: true });
          screenshotPaths.push(path);
          return `Screenshot saved: ${filename}`;
        }
        case 'extract': {
          extractedData[action.key as string] = action.value;
          return `Extracted ${action.key} = ${action.value}`;
        }
        case 'navigate': {
          const url = action.url;
          if (!url) return 'Navigate failed: no url provided';
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await this.delay(600);
          return `Navigated to: ${url}`;
        }
        case 'fetch': {
          const url = action.url;
          const key = (action.key as string) ?? 'fetchResult';
          if (!url) return 'Fetch failed: no url provided';
          const result = await page.evaluate(async (fetchUrl: string) => {
            try {
              const r = await fetch(fetchUrl, { headers: { Accept: 'application/json' } });
              return { status: r.status, body: (await r.text()).slice(0, 4000) };
            } catch (e) {
              return { status: 0, body: (e as Error).message };
            }
          }, url);
          extractedData[key] = result.body;
          return `Fetched ${url} → status ${result.status}`;
        }
        case 'done':
        case 'error':
          return (action.comment ?? action.reason ?? '') as string;
        default:
          return `Unknown action type: ${action.type}`;
      }
    } catch (err: unknown) {
      return `Action failed (${action.type}): ${(err as Error).message}`;
    }
  }

  private async resolveElement(page: Page, target: string) {
    if (!target) return null;
    const looksLikeCSS = /^[.#\[a-z]/.test(target) && !/\s/.test(target.split('[')[0]);
    if (looksLikeCSS) {
      try {
        const el = await page.$(target);
        if (el) return el;
      } catch { /* fall through */ }
    }
    try {
      const el = await page.$('::-p-aria(' + target + ')');
      if (el) return el;
    } catch { /* fall through */ }
    try {
      const el = await page.$('::-p-text(' + target + ')');
      if (el) return el;
    } catch { /* fall through */ }
    return null;
  }

  private parseAction(text: string): BrowserAction | null {
    const cleaned = text.replace(/```[a-z]*\n?/gi, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as BrowserAction;
    } catch {
      return null;
    }
  }

  private fail(step: number, reason: string): RunSourceResult {
    return { success: false, screenshotPaths: [], extractedData: {}, learnedSteps: [], comment: null, failedAtStep: step, error: reason };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
