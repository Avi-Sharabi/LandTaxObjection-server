import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import axios, { AxiosResponse } from 'axios';
import { McpService } from 'src/mcp/mcp.service';
import { PropertyAnalysisResult, VgEmailOutcome } from './vg-email-analysis.queue';

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

export interface AnalyzeEmailResult {
  results: PropertyAnalysisResult[];
  rawResponse: unknown;
}

@Injectable()
export class VgEmailAnalysisService implements OnModuleInit {
  private readonly logger = new Logger(VgEmailAnalysisService.name);
  private skillContent = '';

  constructor(
    private readonly config: ConfigService,
    private readonly mcpService: McpService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    this.skillContent = this.mcpService.getSkillContent('email-analyzer');
    this.logger.log(`[VG-ANALYSIS] Skill loaded (${this.skillContent.length} chars)`);
  }

  async analyzeEmail(
    subject: string | null,
    body: string | null,
    correlationId?: string,
  ): Promise<AnalyzeEmailResult> {
    const mcpPublicUrl = this.config.get<string>('MCP_PUBLIC_URL');
    const mcpUrl = mcpPublicUrl ? `${mcpPublicUrl}/api/mcp` : null;
    const mcpToken = mcpUrl ? this.config.getOrThrow<string>('MCP_SECRET_TOKEN') : null;

    const identifiers = this.extractIdentifiers(subject, body);
    const prefetchedCases = await this.prefetchMatchingCases(identifiers);
    this.logger.log(
      `[VG-ANALYSIS] Pre-fetch — pids=${identifiers.pids.join(',') || 'none'} lodgmentRefs=${identifiers.lodgmentRefs.join(',') || 'none'} — found=${prefetchedCases.length} case(s) (address-only properties resolved post-classification)`,
    );

    const userPrompt = this.buildAnalysisPrompt(subject, body, prefetchedCases);
    const startMs = Date.now();

    let response: AxiosResponse<AnthropicApiResponse>;
    try {
      response = await axios.post<AnthropicApiResponse>(
        this.config.getOrThrow<string>('ANTHROPIC_API_URL'),
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
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

    const textBlock = content?.findLast((b: { type: string; text?: string }) => b.type === 'text');
    const parsed = this.parseResponse(textBlock?.text ?? '');
    this.logger.log(
      `[VG-ANALYSIS] Classified ${parsed.results.length} property result(s): ${parsed.results.map((r) => `pid=${r.pid ?? 'unknown'} outcome=${r.outcome} caseId=${r.caseId ?? '-'}`).join(' | ')}`,
    );
    return parsed;
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

  private async prefetchMatchingCases(identifiers: {
    pids: string[];
    lodgmentRefs: string[];
  }): Promise<PrefetchedCase[]> {
    const activeStatuses = ['submitted_to_vg', 'awaiting_vg_response'];
    const seen = new Set<string>();
    const results: PrefetchedCase[] = [];

    const merge = (rows: PrefetchedCase[]) => {
      for (const row of rows) {
        if (!seen.has(row.case_id)) {
          seen.add(row.case_id);
          results.push(row);
        }
      }
    };

    try {
      if (identifiers.pids.length > 0) {
        const rows = await this.dataSource.query<PrefetchedCase[]>(
          `SELECT dc.id AS case_id, dc.case_reference, dc.status, p.pid, p.address, dc.lodgment_reference_number
           FROM dispute_cases dc
           JOIN properties p ON p.id = dc.property_id
           WHERE p.pid = ANY($1) AND dc.status = ANY($2)
           ORDER BY dc.submitted_at DESC`,
          [identifiers.pids, activeStatuses],
        );
        merge(rows);
      }

      if (identifiers.lodgmentRefs.length > 0) {
        const rows = await this.dataSource.query<PrefetchedCase[]>(
          `SELECT dc.id AS case_id, dc.case_reference, dc.status, p.pid, p.address, dc.lodgment_reference_number
           FROM dispute_cases dc
           JOIN properties p ON p.id = dc.property_id
           WHERE dc.lodgment_reference_number = ANY($1) AND dc.status = ANY($2)
           ORDER BY dc.submitted_at DESC`,
          [identifiers.lodgmentRefs, activeStatuses],
        );
        merge(rows);
      }
    } catch (err) {
      this.logger.warn('[VG-ANALYSIS] Pre-fetch DB query failed — Claude will attempt MCP lookup', (err as Error).message);
    }

    return results;
  }

  async lookupCaseByAddress(address: string): Promise<PrefetchedCase | null> {
    try {
      const rows = await this.dataSource.query<PrefetchedCase[]>(
        `SELECT dc.id AS case_id, dc.case_reference, dc.status, p.pid, p.address, dc.lodgment_reference_number
         FROM dispute_cases dc
         JOIN properties p ON p.id = dc.property_id
         WHERE p.address ILIKE $1
           AND dc.status = ANY($2)
         ORDER BY dc.submitted_at DESC
         LIMIT 1`,
        [`%${address}%`, ['submitted_to_vg', 'awaiting_vg_response']],
      );
      return rows[0] ?? null;
    } catch (err) {
      this.logger.warn(`[VG-ANALYSIS] Address lookup failed for "${address}"`, (err as Error).message);
      return null;
    }
  }

  private buildAnalysisPrompt(subject: string | null, body: string | null, prefetchedCases: PrefetchedCase[]): string {
    const plainBody = body
      ? body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : '(no body)';

    const step3 =
      prefetchedCases.length > 0
        ? `### Step 3 — Match each property to a dispute case (server pre-fetched results):
The server already queried the database. For each PID or property found in the email, match it to the
correct entry below using the pid field. Set case_id to null if no entry matches.

\`\`\`json
${JSON.stringify(prefetchedCases, null, 2)}
\`\`\``
        : `### Step 3 — Find each dispute case in the database (REQUIRED when outcome is approved or declined):
For each PID found, run a separate query:

\`\`\`sql
SELECT dc.id AS case_id, dc.case_reference, dc.status, p.pid, p.address
FROM dispute_cases dc
JOIN properties p ON p.id = dc.property_id
WHERE p.pid = '<extracted_pid>'
  AND dc.status IN ('submitted_to_vg', 'awaiting_vg_response')
ORDER BY dc.submitted_at DESC
LIMIT 1
\`\`\`

For address-only properties:
\`\`\`sql
SELECT dc.id AS case_id, dc.case_reference, dc.status, p.pid, p.address
FROM dispute_cases dc
JOIN properties p ON p.id = dc.property_id
WHERE p.address ILIKE '%<extracted_address>%'
  AND dc.status IN ('submitted_to_vg', 'awaiting_vg_response')
ORDER BY dc.submitted_at DESC
LIMIT 1
\`\`\`

For lodgment references:
\`\`\`sql
SELECT id AS case_id, case_reference, status, lodgment_reference_number
FROM dispute_cases
WHERE lodgment_reference_number = '<lodgment_ref>'
  AND status IN ('submitted_to_vg', 'awaiting_vg_response')
LIMIT 1
\`\`\``;

    return `## Email Received from Valuer-General's Office

Subject: ${subject ?? '(no subject)'}

Body:
${plainBody}

---

## Your Task — follow ALL steps in order

### Step 1 — Read the email and list every property mentioned:
Identify all occurrences of:
- **PID** (e.g. "3007700" from "PID-3007700", "PID: 3007700", or "PID 3007700")
- **Property address** (e.g. "1 Smith Street, Sydney NSW 2000")
- **Case reference** (e.g. "LTD-2024-ABC-001")
- **Lodgment reference** (e.g. "VG-DC-2025-001-1746000000")

There may be one property or many — list them all.

### Step 2 — Classify the outcome for EACH property independently:
- **approved** — the objection was upheld, valuation reduced or amended in the client's favour
- **declined** — the objection was rejected, original valuation maintained
- **needs_review** — ambiguous, procedural, or no clear final determination for this specific property

${step3}

### Step 4 — Return a JSON ARRAY only (no prose before or after).
One object per property mentioned in the email.
If the email mentions no specific property, return a single entry with pid=null and outcome=needs_review.

\`\`\`json
[
  {
    "pid": "<PID string from the email, or null if not present>",
    "address": "<property address from the email, or null if not present>",
    "outcome": "approved" | "declined" | "needs_review",
    "confidence": 0.0–1.0,
    "reasoning": "one sentence citing the key signal for this specific property",
    "case_id": "<UUID from matched case, or null>"
  }
]
\`\`\``;
  }

  private parseResponse(raw: string): AnalyzeEmailResult {
    // Prefer a JSON array; fall back to a single object wrapped in an array
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    const objectMatch = raw.match(/\{[\s\S]*\}/);

    let items: unknown[];
    try {
      if (arrayMatch) {
        items = JSON.parse(arrayMatch[0]) as unknown[];
      } else if (objectMatch) {
        items = [JSON.parse(objectMatch[0])];
      } else {
        this.logger.warn('[VG-ANALYSIS] No JSON found in response — defaulting to needs_review');
        return this.fallback('needs_review', 'Could not parse AI response');
      }
    } catch {
      this.logger.warn('[VG-ANALYSIS] JSON parse failed — defaulting to needs_review');
      return this.fallback('needs_review', 'JSON parse error in AI response');
    }

    const results: PropertyAnalysisResult[] = items.map((item) => {
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
      };
    });

    return { results, rawResponse: items };
  }

  private fallback(outcome: VgEmailOutcome, reasoning: string): AnalyzeEmailResult {
    return {
      results: [{ pid: null, address: null, outcome, confidence: 0, reasoning, caseId: null }],
      rawResponse: { outcome, reasoning },
    };
  }
}
