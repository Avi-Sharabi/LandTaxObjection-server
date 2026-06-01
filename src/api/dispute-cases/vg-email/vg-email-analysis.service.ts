import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import { McpService } from 'src/mcp/mcp.service';
import { DisputeCasesService } from '../dispute-cases.service';
import { DisputeStatus } from '../entities/dispute-case.entity';
import { MsGraphService } from 'src/common/ms-graph/ms-graph.service';

export type VgEmailOutcome = 'approved' | 'declined' | 'needs_review';

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

interface AnthropicApiResponse {
  stop_reason: string;
  content: { type: string; text?: string; thinking?: string }[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

const ACTIVE_VG_STATUSES = ['submitted_to_vg', 'for_review'];

@Injectable()
export class VgEmailAnalysisService implements OnModuleInit {
  private readonly logger = new Logger(VgEmailAnalysisService.name);
  private skillContent = '';
  private propertyFinderContent = '';

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly mcpService: McpService,
    private readonly disputeCasesService: DisputeCasesService,
    private readonly msGraphService: MsGraphService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    this.skillContent = this.mcpService.getSkillContent('email-analyzer');
    this.propertyFinderContent =
      this.mcpService.getSkillContent('property-finder');
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

    if (result.outcome === 'approved' || result.outcome === 'declined') {
      if (caseId) {
        const newStatus =
          result.outcome === 'approved'
            ? DisputeStatus.VG_APPROVED
            : DisputeStatus.VG_DECLINED;
        try {
          await this.disputeCasesService.updateVgOutcome(
            caseId,
            newStatus,
            result.reasoning,
          );
          this.logger.log(`[VG-ANALYSIS] Case ${caseId} → ${newStatus}`);
        } catch (err) {
          this.logger.error(
            `[VG-ANALYSIS] updateVgOutcome failed for caseId=${caseId} — ${(err as Error).message}`,
          );
        }
      } else {
        this.logger.warn(
          `[VG-ANALYSIS] outcome=${result.outcome} but no case resolved — status unchanged`,
        );
      }
    } else {
      if (caseId) {
        try {
          await this.disputeCasesService.updateVgOutcome(
            caseId,
            DisputeStatus.FOR_REVIEW,
            result.reasoning,
          );
          this.logger.log(
            `[VG-ANALYSIS] Case ${caseId} → ${DisputeStatus.FOR_REVIEW}`,
          );
        } catch (err) {
          this.logger.error(
            `[VG-ANALYSIS] updateVgOutcome failed for caseId=${caseId} — ${(err as Error).message}`,
          );
        }
      } else {
        this.logger.log(
          `[VG-ANALYSIS] outcome=needs_review — no case resolved, status unchanged`,
        );
      }
    }

    await this.safeMarkAsRead(messageId);
  }

  async analyzeEmail(
    subject: string | null,
    body: string | null,
    correlationId?: string,
  ): Promise<VgEmailResult> {
    const mcpPublicUrl = this.config.get<string>('MCP_PUBLIC_URL');
    const mcpUrl = mcpPublicUrl ? `${mcpPublicUrl}/api/mcp` : null;
    const mcpToken = mcpUrl
      ? this.config.getOrThrow<string>('MCP_SECRET_TOKEN')
      : null;

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

    let response: { data: AnthropicApiResponse };
    try {
      response = await firstValueFrom(
        this.http.post<AnthropicApiResponse>(
          this.config.getOrThrow<string>('ANTHROPIC_API_URL'),
          {
            model: 'claude-sonnet-4-6',
            max_tokens: 6000,
            thinking: {
              type: 'enabled',
              budget_tokens: 4000,
            },
            system: [
              {
                type: 'text',
                text: this.skillContent,
                cache_control: { type: 'ephemeral' },
              },
              {
                type: 'text',
                text: this.propertyFinderContent,
                cache_control: { type: 'ephemeral' },
              },
            ],
            ...(mcpUrl && mcpToken
              ? {
                  mcp_servers: [
                    {
                      type: 'url',
                      url: mcpUrl,
                      name: 'postgres',
                      authorization_token: mcpToken,
                    },
                  ],
                }
              : {}),
            messages: [{ role: 'user', content: userPrompt }],
          },
          {
            headers: {
              'x-api-key': this.config.get<string>('ANTHROPIC_API_KEY'),
              'anthropic-version': '2023-06-01',
              'anthropic-beta':
                'mcp-client-2025-04-04,prompt-caching-2024-07-31,interleaved-thinking-2025-05-14',
              'Content-Type': 'application/json',
            },
          },
        ),
      );
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const status = err.response?.status;
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

    const { stop_reason, content, usage } = response.data;
    const thinkingBlock = content?.find((b) => b.type === 'thinking');
    this.logger.log(
      JSON.stringify({
        context: 'VG-ANALYSIS.token_usage',
        correlationId,
        input_tokens: usage?.input_tokens ?? 0,
        output_tokens: usage?.output_tokens ?? 0,
        cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
        thinking_length: thinkingBlock?.thinking?.length ?? 0,
        durationMs: Date.now() - startMs,
        stop_reason,
      }),
    );

    if (stop_reason === 'max_tokens') {
      this.logger.warn(
        '[VG-ANALYSIS] Response truncated — defaulting to needs_review',
      );
      return this.fallback(
        'needs_review',
        'Response truncated — manual review required',
      );
    }

    const textBlock = content?.findLast((b) => b.type === 'text');
    return this.parseResponse(textBlock?.text ?? '');
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
      return `### Case Lookup — no match found
The server queried the database using identifiers from this email and found NO matching case in \`submitted_to_vg\` or \`for_review\` status. Set \`case_id\` to \`null\`. Do NOT query via MCP — the server result is authoritative.`;
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
Fields: pid, address, outcome ("approved"|"declined"|"needs_review"), confidence (float 0.0–1.0), reasoning (one sentence citing the specific phrase that drove the decision), case_id (UUID or null), conflict_detected (boolean).`;
  }

  private parseResponse(raw: string): VgEmailResult {
    // Prefer extracting from a markdown code fence to avoid greedy-regex grabbing prose before the JSON block.
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const objectMatch = fenceMatch
      ? fenceMatch[1].match(/\{[\s\S]*\}/)
      : raw.match(/\{[\s\S]*\}/);
    const arrayMatch = fenceMatch
      ? fenceMatch[1].match(/\[[\s\S]*\]/)
      : raw.match(/\[[\s\S]*\]/);

    let item: unknown;
    try {
      if (objectMatch) {
        item = JSON.parse(objectMatch[0]);
      } else if (arrayMatch) {
        const arr = JSON.parse(arrayMatch[0]) as unknown[];
        item = arr[0];
      } else {
        this.logger.warn(
          '[VG-ANALYSIS] No JSON found in response — defaulting to needs_review',
        );
        return this.fallback('needs_review', 'Could not parse AI response');
      }
    } catch {
      this.logger.warn(
        '[VG-ANALYSIS] JSON parse failed — defaulting to needs_review',
      );
      return this.fallback('needs_review', 'JSON parse error in AI response');
    }

    const p = item as Record<string, unknown>;
    const outcome = p['outcome'];
    const validOutcome: VgEmailOutcome =
      outcome === 'approved' || outcome === 'declined'
        ? outcome
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
