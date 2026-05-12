import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import axios, { AxiosResponse } from 'axios';
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
  content: { type: string; text?: string }[];
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

  constructor(
    private readonly config: ConfigService,
    private readonly mcpService: McpService,
    private readonly disputeCasesService: DisputeCasesService,
    private readonly msGraphService: MsGraphService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    this.skillContent = this.mcpService.getSkillContent('email-analyzer');
    this.logger.log(`[VG-ANALYSIS] Skill loaded (${this.skillContent.length} chars)`);
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
        this.logger.log(`[VG-ANALYSIS] Case resolved via address lookup → caseId=${caseId}`);
      }
    }

    if (result.outcome === 'approved' || result.outcome === 'declined') {
      if (caseId) {
        const newStatus = result.outcome === 'approved'
          ? DisputeStatus.VG_APPROVED
          : DisputeStatus.VG_DECLINED;
        try {
          await this.disputeCasesService.updateVgOutcome(caseId, newStatus, result.reasoning);
          this.logger.log(`[VG-ANALYSIS] Case ${caseId} → ${newStatus}`);
        } catch (err) {
          this.logger.error(`[VG-ANALYSIS] updateVgOutcome failed for caseId=${caseId} — ${(err as Error).message}`);
        }
      } else {
        this.logger.warn(`[VG-ANALYSIS] outcome=${result.outcome} but no case resolved — status unchanged`);
      }
    } else {
      if (caseId) {
        try {
          await this.disputeCasesService.updateVgOutcome(caseId, DisputeStatus.FOR_REVIEW, result.reasoning);
          this.logger.log(`[VG-ANALYSIS] Case ${caseId} → ${DisputeStatus.FOR_REVIEW}`);
        } catch (err) {
          this.logger.error(`[VG-ANALYSIS] updateVgOutcome failed for caseId=${caseId} — ${(err as Error).message}`);
        }
      } else {
        this.logger.log(`[VG-ANALYSIS] outcome=needs_review — no case resolved, status unchanged`);
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
    const mcpToken = mcpUrl ? this.config.getOrThrow<string>('MCP_SECRET_TOKEN') : null;

    const identifiers = this.extractIdentifiers(subject, body);
    const prefetch = await this.prefetchMatchingCase(identifiers);
    this.logger.log(
      `[VG-ANALYSIS] Pre-fetch — pids=${identifiers.pids.join(',') || 'none'} lodgmentRefs=${identifiers.lodgmentRefs.join(',') || 'none'} — found=${prefetch.case ? 1 : 0} case(s)`,
    );

    const userPrompt = this.buildAnalysisPrompt(subject, body, prefetch.case, prefetch.dbQueried);
    const startMs = Date.now();

    let response: AxiosResponse<AnthropicApiResponse>;
    try {
      response = await axios.post<AnthropicApiResponse>(
        this.config.getOrThrow<string>('ANTHROPIC_API_URL'),
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: [
            {
              type: 'text',
              text: this.skillContent,
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
            'anthropic-beta': 'mcp-client-2025-04-04,prompt-caching-2024-07-31',
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        this.logger.error(
          `[VG-ANALYSIS] Anthropic API error status=${status} correlationId=${correlationId ?? '-'} — ${err.message}`,
        );
        if (status === 529 || status === 503) throw new Error('Anthropic API temporarily overloaded — retry later');
        if (status === 401) throw new Error('Anthropic API key invalid or expired');
      }
      throw err;
    }

    const { stop_reason, content, usage } = response.data;
    this.logger.log(
      JSON.stringify({
        context: 'VG-ANALYSIS.token_usage',
        correlationId,
        input_tokens: usage?.input_tokens ?? 0,
        output_tokens: usage?.output_tokens ?? 0,
        cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
        durationMs: Date.now() - startMs,
        stop_reason,
      }),
    );

    if (stop_reason === 'max_tokens') {
      this.logger.warn('[VG-ANALYSIS] Response truncated — defaulting to needs_review');
      return this.fallback('needs_review', 'Response truncated — manual review required');
    }

    const textBlock = content?.findLast((b) => b.type === 'text');
    return this.parseResponse(textBlock?.text ?? '');
  }

  private extractIdentifiers(
    subject: string | null,
    body: string | null,
  ): { pids: string[]; lodgmentRefs: string[] } {
    const text = `${subject ?? ''} ${body ?? ''}`;
    const pids = [...text.matchAll(/\bPID[-:\s]*(\d{5,8})\b/gi)].map((m) => m[1]);
    const lodgmentRefs = [...text.matchAll(/\bVG-DC-\d{4}-[A-Z0-9]+-\d+\b/gi)].map((m) => m[0]);
    return {
      pids: [...new Set(pids)],
      lodgmentRefs: [...new Set(lodgmentRefs)],
    };
  }

  private async prefetchMatchingCase(identifiers: {
    pids: string[];
    lodgmentRefs: string[];
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

      if (identifiers.lodgmentRefs.length > 0) {
        const rows = await this.dataSource.query<PrefetchedCase[]>(
          `SELECT dc.id AS case_id, dc.case_reference, dc.status, p.pid, p.address, dc.lodgment_reference_number
           FROM dispute_cases dc
           JOIN properties p ON p.id = dc.property_id
           WHERE dc.lodgment_reference_number = ANY($1) AND dc.status = ANY($2)
           ORDER BY dc.submitted_at DESC
           LIMIT 1`,
          [identifiers.lodgmentRefs, ACTIVE_VG_STATUSES],
        );
        if (rows[0]) return { case: rows[0], dbQueried: true };
      }

      // DB query ran successfully but found no matching case
      return { case: null, dbQueried: identifiers.pids.length > 0 || identifiers.lodgmentRefs.length > 0 };
    } catch (err) {
      this.logger.warn('[VG-ANALYSIS] Pre-fetch DB query failed — Claude will attempt MCP lookup', (err as Error).message);
      return { case: null, dbQueried: false };
    }
  }

  async lookupCaseByAddress(address: string): Promise<PrefetchedCase | null> {
    try {
      const rows = await this.dataSource.query<PrefetchedCase[]>(
        `SELECT dc.id AS case_id, dc.case_reference, dc.status, p.pid, p.address, dc.lodgment_reference_number
         FROM dispute_cases dc
         JOIN properties p ON p.id = dc.property_id
         WHERE (
           p.address ILIKE $1
           OR $2 ILIKE '%' || p.address || '%'
         )
           AND dc.status = ANY($3)
         ORDER BY dc.submitted_at DESC
         LIMIT 1`,
        [`%${address}%`, address, ACTIVE_VG_STATUSES],
      );
      return rows[0] ?? null;
    } catch (err) {
      this.logger.warn(`[VG-ANALYSIS] Address lookup failed for "${address}"`, (err as Error).message);
      return null;
    }
  }

  private buildAnalysisPrompt(
    subject: string | null,
    body: string | null,
    prefetchedCase: PrefetchedCase | null,
    dbQueried: boolean,
  ): string {
    const plainBody = body
      ? body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : '(no body)';

    let step3: string;
    if (prefetchedCase) {
      step3 = `### Step 3 — Match the property to a dispute case (server pre-fetched result):
The server already queried the database. Match the property in the email to the entry below.
Set case_id to null if it does not match.

\`\`\`json
${JSON.stringify(prefetchedCase, null, 2)}
\`\`\``;
    } else if (dbQueried) {
      step3 = `### Step 3 — Case lookup result (server pre-fetched):
The server queried the database using the identifiers extracted from this email and found NO matching case in \`submitted_to_vg\` or \`for_review\` status.
Set \`case_id\` to \`null\`. Do NOT query the database via MCP — the server result is authoritative.`;
    } else {
      step3 = `### Step 3 — Find the dispute case in the database (REQUIRED when outcome is approved or declined):

\`\`\`sql
SELECT dc.id AS case_id, dc.case_reference, dc.status, p.pid, p.address
FROM dispute_cases dc
JOIN properties p ON p.id = dc.property_id
WHERE p.pid = '<extracted_pid>'
  AND dc.status IN ('submitted_to_vg', 'for_review')
ORDER BY dc.submitted_at DESC
LIMIT 1
\`\`\`

For address-only:
\`\`\`sql
SELECT dc.id AS case_id, dc.case_reference, dc.status, p.pid, p.address
FROM dispute_cases dc
JOIN properties p ON p.id = dc.property_id
WHERE p.address ILIKE '%<extracted_address>%'
  AND dc.status IN ('submitted_to_vg', 'for_review')
ORDER BY dc.submitted_at DESC
LIMIT 1
\`\`\`

For lodgment reference:
\`\`\`sql
SELECT id AS case_id, case_reference, status, lodgment_reference_number
FROM dispute_cases
WHERE lodgment_reference_number = '<lodgment_ref>'
  AND status IN ('submitted_to_vg', 'for_review')
LIMIT 1
\`\`\``;
    }

    return `## Email to Classify

Subject: ${subject ?? '(no subject)'}

Body:
${plainBody}

---

${step3}

---

## Required Output

Classify this email and return a single JSON object. Follow the system prompt rules silently — do not narrate steps.

\`\`\`json
{
  "pid": "<PID digits from email, or null>",
  "address": "<property address from email, or null — always include if visible>",
  "outcome": "approved" | "declined" | "needs_review",
  "confidence": 0.0,
  "reasoning": "one sentence citing the matched phrase or reason",
  "case_id": "<UUID from matched case, or null>",
  "conflict_detected": false
}
\`\`\`

Rules:
- \`outcome\` must be exactly \`"approved"\`, \`"declined"\`, or \`"needs_review"\`
- Always extract \`address\` if visible — even if no case match is possible
- \`conflict_detected: true\` only when PID and address resolve to **different** cases`;
  }

  private parseResponse(raw: string): VgEmailResult {
    // Prefer extracting from a markdown code fence to avoid greedy-regex grabbing prose before the JSON block.
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const objectMatch = fenceMatch ? fenceMatch[1].match(/\{[\s\S]*\}/) : raw.match(/\{[\s\S]*\}/);
    const arrayMatch = fenceMatch ? fenceMatch[1].match(/\[[\s\S]*\]/) : raw.match(/\[[\s\S]*\]/);

    let item: unknown;
    try {
      if (objectMatch) {
        item = JSON.parse(objectMatch[0]);
      } else if (arrayMatch) {
        const arr = JSON.parse(arrayMatch[0]) as unknown[];
        item = arr[0];
      } else {
        this.logger.warn('[VG-ANALYSIS] No JSON found in response — defaulting to needs_review');
        return this.fallback('needs_review', 'Could not parse AI response');
      }
    } catch {
      this.logger.warn('[VG-ANALYSIS] JSON parse failed — defaulting to needs_review');
      return this.fallback('needs_review', 'JSON parse error in AI response');
    }

    const p = item as Record<string, unknown>;
    const outcome = p['outcome'];
    const validOutcome: VgEmailOutcome =
      outcome === 'approved' || outcome === 'declined' ? outcome : 'needs_review';

    const rawCaseId = p['case_id'];
    const caseId =
      typeof rawCaseId === 'string' && rawCaseId !== 'null' && rawCaseId.trim() !== ''
        ? rawCaseId.trim()
        : null;

    const rawPid = p['pid'];
    const pid =
      typeof rawPid === 'string' && rawPid !== 'null' && rawPid.trim() !== ''
        ? rawPid.trim()
        : null;

    const rawAddress = p['address'];
    const address =
      typeof rawAddress === 'string' && rawAddress !== 'null' && rawAddress.trim() !== ''
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
    return { pid: null, address: null, outcome, confidence: 0, reasoning, caseId: null, conflictDetected: false };
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
