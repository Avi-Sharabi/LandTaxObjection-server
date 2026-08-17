import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { APIError } from '@anthropic-ai/sdk';
import { SkillRegistryService } from 'src/mcp/skill-registry.service';
import { AnthropicService } from 'src/ai/anthropic.service';
import { DisputeCasesService } from '../dispute-cases.service';
import { OutcomeResult } from '../entities/dispute-case.entity';
import { VG_EMAIL_MATCHABLE_STATUSES } from '../dispute-status';
import { MsGraphService } from 'src/common/ms-graph/ms-graph.service';

export type VgEmailOutcome =
  | 'approved'
  | 'partially_agreed'
  | 'declined'
  | 'needs_review';

export interface VgEmailResult {
  pid: string | null;
  address: string | null;
  outcome: VgEmailOutcome;
  confidence: number;
  reasoning: string;
  caseId: string | null;
  conflictDetected: boolean;
}

interface PrefetchedCase {
  case_id: string;
  case_reference: string;
  status: string;
  pid: string | null;
  address: string | null;
  lodgment_reference_number: string | null;
}

// Derived from the canonical status metadata rather than hand-written literals. These values
// are bound into raw SQL (`dc.status = ANY($n)`), where a stale literal would return zero rows
// WITHOUT erroring — silently making every inbound VG reply unresolvable.
const ACTIVE_VG_STATUSES: string[] = [...VG_EMAIL_MATCHABLE_STATUSES];

/**
 * Classifier verdict -> the financial outcome it implies, where it implies one. Also the single
 * definition of the verdict vocabulary — parseResponse validates against these keys.
 *
 * The monitor deliberately does NOT write a case status: it records the verdict as data, notifies
 * the accountant, and leaves a human to move the case through PATCH /:id/status.
 */
const OUTCOME_TO_RESULT: Record<VgEmailOutcome, OutcomeResult | null> = {
  approved: OutcomeResult.UPHELD,
  partially_agreed: OutcomeResult.PARTIALLY_UPHELD,
  declined: OutcomeResult.REJECTED,
  needs_review: null,
};

@Injectable()
export class VgEmailAnalysisService implements OnModuleInit {
  private readonly logger = new Logger(VgEmailAnalysisService.name);
  private skillContent = '';
  private propertyFinderContent = '';

  constructor(
    private readonly anthropic: AnthropicService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly disputeCasesService: DisputeCasesService,
    private readonly msGraphService: MsGraphService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    this.skillContent = this.skillRegistry.getSkillContent('email-analyzer');
    this.propertyFinderContent =
      this.skillRegistry.getSkillContent('property-finder');
    this.logger.log(
      `[VG-ANALYSIS] Skills loaded — email-analyzer(${this.skillContent.length}), property-finder(${this.propertyFinderContent.length})`,
    );
  }

  async processEmail(
    messageId: string,
    subject: string | null,
    body: string | null,
  ): Promise<void> {
    const result = await this.analyzeEmail(subject, body, messageId);

    this.logger.log(
      `[VG-ANALYSIS] Result — pid=${result.pid ?? '-'} outcome=${result.outcome} confidence=${result.confidence.toFixed(2)} caseId=${result.caseId ?? '-'} conflictDetected=${result.conflictDetected}`,
    );

    if (result.conflictDetected) {
      this.logger.warn(
        `[VG-ANALYSIS] Identifier conflict detected for messageId=${messageId} — PID and address resolve to different cases. Manual review required. Status unchanged.`,
      );
      await this.safeMarkAsRead(messageId);
      return;
    }

    let caseId = result.caseId;
    if (!caseId && result.address) {
      const found = await this.lookupCaseByAddress(result.address);
      caseId = found?.case_id ?? null;
      if (caseId) {
        this.logger.log(
          `[VG-ANALYSIS] Case resolved via address lookup → caseId=${caseId}`,
        );
      }
    }

    if (caseId) {
      try {
        await this.disputeCasesService.recordVgEmailClassification(
          caseId,
          result.outcome,
          OUTCOME_TO_RESULT[result.outcome],
          result.reasoning,
          result.confidence,
        );
        this.logger.log(
          `[VG-ANALYSIS] Case ${caseId} classified as ${result.outcome} — status unchanged, awaiting a human`,
        );
      } catch (err) {
        this.logger.error(
          `[VG-ANALYSIS] recordVgEmailClassification failed for caseId=${caseId} — ${(err as Error).message}`,
        );
      }
    } else {
      this.logger.warn(
        `[VG-ANALYSIS] outcome=${result.outcome} but no case resolved — nothing recorded`,
      );
    }

    await this.safeMarkAsRead(messageId);
  }

  async analyzeEmail(
    subject: string | null,
    body: string | null,
    correlationId?: string,
  ): Promise<VgEmailResult> {
    const identifiers = this.extractIdentifiers(subject, body);
    const prefetch = await this.prefetchMatchingCase(identifiers);
    this.logger.log(
      `[VG-ANALYSIS] Pre-fetch — pids=${identifiers.pids.join(',') || 'none'} addresses=${identifiers.addresses.join(',') || 'none'} — found=${prefetch.case ? 1 : 0} case(s)`,
    );

    const userPrompt = this.buildUserMessage(
      subject,
      body,
      prefetch.case,
      prefetch.dbQueried,
    );
    const startMs = Date.now();

    let result: Awaited<ReturnType<AnthropicService['call']>>;
    try {
      result = await this.anthropic.call({
        systemBlocks: [
          { text: this.skillContent },
          { text: this.propertyFinderContent },
        ],
        userMessage: userPrompt,
        maxTokens: 6000,
        thinkingBudgetTokens: 4000,
        mcpServers: true,
      });
    } catch (err: unknown) {
      if (err instanceof APIError) {
        const status = err.status;
        this.logger.error(
          `[VG-ANALYSIS] Anthropic API error status=${status} correlationId=${correlationId ?? '-'} — ${err.message}`,
        );
        if (status === 529 || status === 503)
          throw new Error('Anthropic API temporarily overloaded — retry later');
        if (status === 401)
          throw new Error('Anthropic API key invalid or expired');
      }
      throw err;
    }

    this.logger.log(
      JSON.stringify({
        context: 'VG-ANALYSIS.token_usage',
        correlationId,
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        cache_read_input_tokens: result.usage.cacheReadInputTokens,
        cache_creation_input_tokens: result.usage.cacheCreationInputTokens,
        durationMs: Date.now() - startMs,
        stop_reason: result.stopReason,
      }),
    );

    if (result.stopReason === 'max_tokens') {
      this.logger.warn(
        '[VG-ANALYSIS] Response truncated — defaulting to needs_review',
      );
      return this.fallback(
        'needs_review',
        'Response truncated — manual review required',
      );
    }

    return this.parseResponse(result.text);
  }

  private extractIdentifiers(
    subject: string | null,
    body: string | null,
  ): { pids: string[]; addresses: string[] } {
    const text = `${subject ?? ''} ${body ?? ''}`;
    const pids = [...text.matchAll(/\bPID[-:\s]*(\d{5,8})\b/gi)].map(
      (m) => m[1],
    );

    const addressMatch = text.match(
      /\d+\s+[A-Z][a-zA-Z\s]+(Street|Road|Avenue|Court|Drive|Place|Close)\s+[A-Z][a-zA-Z\s]+/i,
    );
    const addresses = addressMatch ? [addressMatch[0].trim()] : [];

    return {
      pids: [...new Set(pids)],
      addresses,
    };
  }

  private async prefetchMatchingCase(identifiers: {
    pids: string[];
    addresses: string[];
  }): Promise<{ case: PrefetchedCase | null; dbQueried: boolean }> {
    try {
      if (identifiers.pids.length > 0) {
        const rows = await this.dataSource.query<PrefetchedCase[]>(
          `SELECT dc.id AS case_id, dc.case_reference, dc.status, p.pid, p.address, dc.lodgment_reference_number
           FROM dispute_cases dc
           JOIN properties p ON p.id = dc.property_id
           WHERE p.pid = ANY($1) AND dc.status = ANY($2)
           ORDER BY dc.submitted_at DESC
           LIMIT 1`,
          [identifiers.pids, ACTIVE_VG_STATUSES],
        );
        if (rows[0]) return { case: rows[0], dbQueried: true };
      }

      // Tier 3: address-based fallback before deferring to MCP
      for (const address of identifiers.addresses) {
        const found = await this.lookupCaseByAddress(address);
        if (found) return { case: found, dbQueried: true };
      }

      return {
        case: null,
        dbQueried:
          identifiers.pids.length > 0 || identifiers.addresses.length > 0,
      };
    } catch (err) {
      this.logger.warn(
        '[VG-ANALYSIS] Pre-fetch DB query failed — Claude will attempt MCP lookup',
        (err as Error).message,
      );
      return { case: null, dbQueried: false };
    }
  }

  private async lookupCaseByAddress(
    address: string,
  ): Promise<PrefetchedCase | null> {
    const BASE_SELECT = `
      SELECT dc.id AS case_id, dc.case_reference, dc.status, p.pid, p.address, dc.lodgment_reference_number
      FROM dispute_cases dc
      JOIN properties p ON p.id = dc.property_id`;

    try {
      // Tier 1: normalised ILIKE — collapse all non-alphanumeric runs to single space on both sides
      const normalized = this.normaliseForSearch(address);
      const tier1 = await this.dataSource.query<PrefetchedCase[]>(
        `${BASE_SELECT}
         WHERE REGEXP_REPLACE(UPPER(p.address), '[^A-Z0-9]+', ' ', 'g') ILIKE $1
           AND dc.status = ANY($2)
         ORDER BY dc.submitted_at DESC LIMIT 1`,
        [`%${normalized}%`, ACTIVE_VG_STATUSES],
      );
      if (tier1[0]) return tier1[0];

      // Tier 2: street token + suburb column (property-finder step 4a — drop unit number)
      const { streetToken, suburb } = this.parseAddressComponents(address);
      if (streetToken && suburb) {
        const tier2 = await this.dataSource.query<PrefetchedCase[]>(
          `${BASE_SELECT}
           WHERE p.address ILIKE $1 AND UPPER(p.suburb) = UPPER($2)
             AND dc.status = ANY($3)
           ORDER BY dc.submitted_at DESC LIMIT 1`,
          [`%${streetToken}%`, suburb, ACTIVE_VG_STATUSES],
        );
        if (tier2[0]) return tier2[0];
      }

      // Tier 3: street token only (property-finder step 4b — token-based fallback)
      if (streetToken) {
        const tier3 = await this.dataSource.query<PrefetchedCase[]>(
          `${BASE_SELECT}
           WHERE p.address ILIKE $1 AND dc.status = ANY($2)
           ORDER BY dc.submitted_at DESC LIMIT 1`,
          [`%${streetToken}%`, ACTIVE_VG_STATUSES],
        );
        if (tier3[0]) return tier3[0];
      }

      return null;
    } catch (err) {
      this.logger.warn(
        `[VG-ANALYSIS] Address lookup failed for "${address}"`,
        (err as Error).message,
      );
      return null;
    }
  }

  private parseAddressComponents(raw: string): {
    streetToken: string | null;
    suburb: string | null;
  } {
    const ABBREV: Record<string, string> = {
      ST: 'STREET',
      RD: 'ROAD',
      AVE: 'AVENUE',
      AV: 'AVENUE',
      CT: 'COURT',
      CRES: 'CRESCENT',
      PDE: 'PARADE',
      TCE: 'TERRACE',
      HWY: 'HIGHWAY',
      DR: 'DRIVE',
      PL: 'PLACE',
      CL: 'CLOSE',
      GR: 'GROVE',
    };

    // Strip unit prefix (property-finder unit equivalence table)
    const stripped = raw.replace(
      /^\s*(unit\s+no\.?|unit|apt|apartment|u)\s*\d+[,/\s]+/i,
      '',
    );

    // Expand street type abbreviations
    const expanded = stripped.replace(
      /\b([A-Za-z]+)\b/g,
      (m) => ABBREV[m.toUpperCase()] ?? m,
    );

    // Split on last comma to isolate suburb/state/postcode
    const commaIdx = expanded.lastIndexOf(',');
    let suburb: string | null = null;
    let streetPart = expanded;

    if (commaIdx !== -1) {
      const afterComma = expanded.slice(commaIdx + 1).trim();
      suburb =
        afterComma
          .replace(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\b/gi, '')
          .replace(/\b\d{4}\b/, '')
          .trim() || null;
      streetPart = expanded.slice(0, commaIdx).trim();
    } else {
      // No comma — last alpha word before optional state/postcode is the suburb
      const suburbMatch = expanded.match(
        /([A-Za-z]+)\s*(?:NSW|VIC|QLD|WA|SA|TAS|NT|ACT)?\s*\d{0,4}\s*$/i,
      );
      suburb = suburbMatch?.[1]?.trim() || null;
    }

    // Extract street name (skip leading street number)
    const streetNameMatch = streetPart.match(/^\d+\s+(.+)/);
    const streetToken = streetNameMatch
      ? streetNameMatch[1].split(/\s+/).slice(0, 2).join(' ').trim() || null
      : null;

    return { streetToken, suburb };
  }

  private normaliseForSearch(address: string): string {
    return address
      .toUpperCase()
      .replace(/\bST\b/g, 'STREET')
      .replace(/\bRD\b/g, 'ROAD')
      .replace(/\bAVE?\b/g, 'AVENUE')
      .replace(/\bCT\b/g, 'COURT')
      .replace(/\bDR\b/g, 'DRIVE')
      .replace(/\bPL\b/g, 'PLACE')
      .replace(/\bCL\b/g, 'CLOSE')
      .replace(/\bCRES\b/g, 'CRESCENT')
      .replace(/\bHWY\b/g, 'HIGHWAY')
      .replace(/\bPDE\b/g, 'PARADE')
      .replace(/\bTCE\b/g, 'TERRACE')
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildCaseLookupContext(
    prefetchedCase: PrefetchedCase | null,
    dbQueried: boolean,
  ): string {
    if (prefetchedCase) {
      return `### Case Lookup — server pre-fetched result
The server already queried the database. Use the case_id below if the property matches; set case_id to null if it does not.

\`\`\`json
${JSON.stringify(prefetchedCase, null, 2)}
\`\`\``;
    }

    if (dbQueried) {
      const matchableStatuses = ACTIVE_VG_STATUSES.map((s) => `\`${s}\``).join(
        ' / ',
      );
      return `### Case Lookup — no match found
The server queried the database using identifiers from this email and found NO matching case in ${matchableStatuses} status. Set \`case_id\` to \`null\`. Do NOT query via MCP — the server result is authoritative.`;
    }

    return '';
  }

  private buildUserMessage(
    subject: string | null,
    body: string | null,
    prefetchedCase: PrefetchedCase | null,
    dbQueried: boolean,
  ): string {
    const plainBody = body
      ? body
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '(no body)';

    const caseLookupContext = this.buildCaseLookupContext(
      prefetchedCase,
      dbQueried,
    );
    const contextSection = caseLookupContext
      ? `\n---\n\n${caseLookupContext}\n\n---\n\n`
      : '\n---\n\n';

    return `Subject: ${subject ?? '(no subject)'}

Body:
${plainBody}
${contextSection}Return a single raw JSON object — no prose, no markdown fences.
Fields: pid, address, outcome ("approved"|"partially_agreed"|"declined"|"needs_review"), confidence (float 0.0–1.0), reasoning (one sentence citing the specific phrase that drove the decision), case_id (UUID or null), conflict_detected (boolean).

Choosing "outcome" — this is a triage signal for the assessor, NOT a status change. Your verdict is
recorded against the case and the assigned accountant is notified; a person then decides what the
case's status becomes. Never describe your verdict as advancing or closing the case.
- "approved" — the VG accepts the objection in full, or reduces the land value to at or below the value we contended for.
- "partially_agreed" — the VG accepts the objection in part: it reduces the assessed land value, but to a figure still ABOVE the value we contended for, or it allows some grounds and rejects others. Any reduction short of what was sought is partial, not approved.
- "declined" — the VG rejects the objection and leaves the assessed land value unchanged.
- "needs_review" — the email does not clearly state a determination, or you cannot tell which of the above applies. Never guess between "approved" and "partially_agreed": if the email states a new value but you cannot establish how it compares to the value contended for, return "needs_review".`;
  }

  private parseResponse(raw: string): VgEmailResult {
    let item: unknown;
    try {
      item = this.anthropic.parseJsonObject<Record<string, unknown>>(raw);
    } catch {
      this.logger.warn(
        '[VG-ANALYSIS] JSON parse failed — defaulting to needs_review',
      );
      return this.fallback('needs_review', 'Could not parse AI response');
    }

    const p = item as Record<string, unknown>;
    const outcome = p['outcome'];
    // Validated against OUTCOME_TO_RESULT so the vocabulary has one definition, not two.
    // Anything unrecognised falls back to needs_review rather than a guessed outcome.
    const validOutcome: VgEmailOutcome =
      typeof outcome === 'string' && outcome in OUTCOME_TO_RESULT
        ? (outcome as VgEmailOutcome)
        : 'needs_review';

    const rawCaseId = p['case_id'];
    const caseId =
      typeof rawCaseId === 'string' &&
      rawCaseId !== 'null' &&
      rawCaseId.trim() !== ''
        ? rawCaseId.trim()
        : null;

    const rawPid = p['pid'];
    const pid =
      typeof rawPid === 'string' && rawPid !== 'null' && rawPid.trim() !== ''
        ? rawPid.trim()
        : null;

    const rawAddress = p['address'];
    const address =
      typeof rawAddress === 'string' &&
      rawAddress !== 'null' &&
      rawAddress.trim() !== ''
        ? rawAddress.trim()
        : null;

    return {
      pid,
      address,
      outcome: validOutcome,
      confidence: typeof p['confidence'] === 'number' ? p['confidence'] : 0.5,
      reasoning: typeof p['reasoning'] === 'string' ? p['reasoning'] : '',
      caseId,
      conflictDetected: p['conflict_detected'] === true,
    };
  }

  private fallback(outcome: VgEmailOutcome, reasoning: string): VgEmailResult {
    return {
      pid: null,
      address: null,
      outcome,
      confidence: 0,
      reasoning,
      caseId: null,
      conflictDetected: false,
    };
  }

  private async safeMarkAsRead(messageId: string): Promise<void> {
    try {
      await this.msGraphService.markMessageAsRead(messageId);
    } catch (err) {
      this.logger.warn(
        `[VG-ANALYSIS] Failed to mark messageId=${messageId} as read: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
