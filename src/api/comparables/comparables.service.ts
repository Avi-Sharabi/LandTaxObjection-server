import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosResponse } from 'axios';
import { ComparableSale } from './entities/comparable-sale.entity';
import { CreateComparableDto } from './dto/create-comparable.dto';
import { ComparableResponseDto } from './dto/comparable-response.dto';
import { GenerateComparableSalesDto } from './dto/generate-comparable-sales.dto';
import { FutureSaleDateException } from './exceptions/future-sale-date.exception';
import {
  InsufficientComparablesException,
  MINIMUM_COMPARABLES,
} from './exceptions/insufficient-comparables.exception';
import { DisputeCaseNotFoundException } from './exceptions/dispute-case-not-found.exception';
import { LlmTruncationException } from './exceptions/llm-truncation.exception';
import { LlmToolUseException } from './exceptions/llm-tool-use.exception';
import { LlmParseException } from './exceptions/llm-parse.exception';
import { LlmApiException } from './exceptions/llm-api.exception';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { McpService } from '../../mcp/mcp.service';

// NSW statutory valuation date for the 2025 determination cycle — update each year
const NSW_STATUTORY_VALUATION_DATE = '1 July 2025';

const MAX_CANDIDATE_SALES = 100;

interface AnthropicErrorBody {
  type: string;
  error: { type: string; message: string };
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

interface SubjectContext {
  pid: string;
  suburb: string;
  landAreaSqm: number | null;
  zoning: string;
  lotDp: string | null;
  dimensions: string | null;
  heightLimitM: number | null;
  vgValueCurrent: number;
  vgValuePrior: number;
  landAreaVgSqm: number | null;
  valuationDate: string;
}

@Injectable()
export class ComparablesService implements OnModuleInit {
  private readonly logger = new Logger(ComparablesService.name);
  private skillContent = '';
  private schemaBlock = '';

  constructor(
    @InjectRepository(ComparableSale)
    private readonly comparablesRepository: Repository<ComparableSale>,
    @InjectRepository(DisputeCase)
    private readonly disputeCasesRepository: Repository<DisputeCase>,
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mcpService: McpService,
  ) { }

  private logEvent(context: string, data: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ context, ...data, ts: new Date().toISOString() }));
  }

  async onModuleInit(): Promise<void> {
    this.skillContent = this.mcpService.getSkillContent('nsw-land-tax-comparables');

    const schemaRows: { column_name: string; data_type: string; is_nullable: string }[] =
      await this.dataSource.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'property_sales_raw'
         ORDER BY ordinal_position`,
      );
    this.schemaBlock = schemaRows
      .map((r) => `  ${r.column_name} (${r.data_type}${r.is_nullable === 'YES' ? ', nullable' : ''})`)
      .join('\n');
    this.logger.log(`[INIT] Skill loaded (${this.skillContent.length} chars), schema loaded (${schemaRows.length} columns)`);
  }

  async create(
    disputeCaseId: string,
    dto: CreateComparableDto,
    createdById: string,
  ): Promise<ComparableResponseDto> {
    await this.assertDisputeCaseExists(disputeCaseId);
    if (dto.contract_date) this.assertSaleDateNotFuture(dto.contract_date);

    const comparable = this.comparablesRepository.create({
      dispute_case_id: disputeCaseId,
      created_by_id: createdById,
      sale_id: dto.sale_id ?? null,
      source_file: dto.source_file ?? null,
      imported_at: dto.imported_at ? new Date(dto.imported_at) : null,
      district_code: dto.district_code ?? null,
      property_id: dto.property_id ?? null,
      sale_counter: dto.sale_counter ?? null,
      download_datetime: dto.download_datetime ? new Date(dto.download_datetime) : null,
      property_name: dto.property_name ?? null,
      property_unit_number: dto.property_unit_number ?? null,
      property_house_number: dto.property_house_number ?? null,
      property_street_name: dto.property_street_name ?? null,
      property_locality: dto.property_locality ?? null,
      property_post_code: dto.property_post_code ?? null,
      area: dto.area ?? null,
      contract_date: dto.contract_date ? new Date(dto.contract_date) : null,
      settlement_date: dto.settlement_date ? new Date(dto.settlement_date) : null,
      purchase_price: dto.purchase_price ?? null,
      zoning: dto.zoning ?? null,
      nature_of_property: dto.nature_of_property ?? null,
      primary_purpose: dto.primary_purpose ?? null,
      strata_lot_number: dto.strata_lot_number ?? null,
      component_code: dto.component_code ?? null,
      sale_code: dto.sale_code ?? null,
      interest_of_sale_percent: dto.interest_of_sale_percent ?? null,
      dealing_number: dto.dealing_number ?? null,
      owner_type: dto.owner_type ?? null,
      adjusted_rate_per_sqm: dto.adjusted_rate_per_sqm ?? null,
      explanation: dto.explanation ?? null,
    });

    const saved = await this.comparablesRepository.save(comparable);
    return plainToInstance(ComparableResponseDto, saved);
  }

  async findByApplicationId(disputeCaseId: string): Promise<ComparableResponseDto[]> {
    await this.assertDisputeCaseExists(disputeCaseId);

    const comparables = await this.comparablesRepository.find({
      where: { dispute_case_id: disputeCaseId },
    });

    return plainToInstance(ComparableResponseDto, comparables);
  }

  /**
   * Gate check — throws InsufficientComparablesException if the dispute case
   * has fewer than MINIMUM_COMPARABLES comparables.
   * Call this before advancing a dispute case to the APPRAISAL status.
   */
  async assertMinimumComparables(disputeCaseId: string): Promise<void> {
    const count = await this.comparablesRepository.count({
      where: { dispute_case_id: disputeCaseId },
    });

    if (count < MINIMUM_COMPARABLES) {
      throw new InsufficientComparablesException(count);
    }
  }

  async generateComparableSales(
    dto: GenerateComparableSalesDto,
    createdById: string,
    correlationId?: string,
  ): Promise<ComparableResponseDto[]> {
    const start = Date.now();
    const mcpPublicUrl = this.configService.get<string>('MCP_PUBLIC_URL');
    const mcpUrl = mcpPublicUrl ? `${mcpPublicUrl}/api/mcp` : null;
    // MCP_SECRET_TOKEN is only needed when MCP_PUBLIC_URL is configured
    const mcpToken = mcpUrl ? this.configService.getOrThrow<string>('MCP_SECRET_TOKEN') : null;

    this.logEvent('GENERATE.start', { correlationId, disputeCaseId: dto.dispute_case_id, mcpUrl: mcpUrl ?? 'disabled (no MCP_PUBLIC_URL)' });

    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id: dto.dispute_case_id },
      relations: ['property', 'valuation_notice'],
    });
    if (!disputeCase) throw new DisputeCaseNotFoundException(dto.dispute_case_id);

    const subject = this.resolveSubjectContext(dto, disputeCase);
    const candidates = await this.prefetchCandidateSales(subject, correlationId);
    const userPrompt = this.buildUserPrompt(subject, candidates);
    const systemPrompt = `${this.skillContent}\n\n## property_sales_raw schema (do NOT call list_tables or describe_table — query directly)\n\`\`\`\n${this.schemaBlock}\n\`\`\``;

    this.logEvent('GENERATE.anthropic.start', { correlationId, systemPromptLength: systemPrompt.length });
    const { text: rawText, usage } = await this.callAnthropicApi(systemPrompt, userPrompt, mcpUrl, mcpToken, correlationId, dto.dispute_case_id);
    const parsed = this.extractJsonArray(rawText);

    this.logEvent('GENERATE.persist', { correlationId, count: parsed.length });
    const saved = await this.persistComparables(parsed, dto.dispute_case_id, createdById);
    this.logEvent('GENERATE.complete', {
      correlationId,
      disputeCaseId: dto.dispute_case_id,
      savedCount: saved.length,
      totalDurationMs: Date.now() - start,
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
    });
    return saved;
  }

  private resolveSubjectContext(
    dto: GenerateComparableSalesDto,
    disputeCase: DisputeCase,
  ): SubjectContext {
    const vn = disputeCase.valuation_notice;
    return {
      pid: dto.pid ?? disputeCase.property?.pid ?? 'unknown',
      suburb: (disputeCase.property?.suburb ?? '').trim().toUpperCase(),
      landAreaSqm: dto.land_area_sqm ?? (Number(disputeCase.property?.land_area_sqm) || null),
      zoning: dto.zoning ?? disputeCase.property?.zoning ?? 'unknown',
      lotDp: dto.lot_dp ?? disputeCase.property?.lot_dp ?? null,
      dimensions: dto.dimensions ?? disputeCase.property?.dimensions ?? null,
      heightLimitM: dto.height_limit_m ?? disputeCase.property?.height_limit_m ?? null,
      vgValueCurrent: dto.vg_land_value_current ?? (Number(vn?.assessed_land_value) || 0),
      vgValuePrior: dto.vg_land_value_prior ?? (Number(vn?.prior_land_value) || 0),
      landAreaVgSqm: dto.land_area_vg_sqm ?? (Number(vn?.land_area_vg_sqm) || null),
      valuationDate: dto.valuation_date
        ?? (vn?.valuation_date ? new Date(vn.valuation_date).toISOString().split('T')[0] : NSW_STATUTORY_VALUATION_DATE),
    };
  }

  private async prefetchCandidateSales(
    subject: SubjectContext,
    correlationId?: string,
  ): Promise<Record<string, unknown>[]> {
    const preT = Date.now();
    try {
      const vd = new Date(subject.valuationDate);
      const searchFrom = new Date(vd);
      searchFrom.setFullYear(searchFrom.getFullYear() - 3);
      const searchFromStr = isNaN(searchFrom.getTime())
        ? new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : searchFrom.toISOString().split('T')[0];

      const zoningPrefix = subject.zoning !== 'unknown' ? subject.zoning.substring(0, 2).toUpperCase() + '%' : null;

      // Select only the columns needed for analysis — avoids sending metadata columns
      // (source_file, imported_at, download_datetime, sale_counter, etc.) to the LLM.
      const analysisColumns = `id, property_id, district_code, property_house_number, property_street_name,
        property_locality, property_post_code, area, zoning, nature_of_property,
        primary_purpose, component_code, sale_code, interest_of_sale_percent,
        contract_date, purchase_price, dealing_number, owner_type`;

      const [tier1, tier2] = await Promise.all([
        subject.suburb
          ? this.dataSource.query(
            // Same suburb — sort same-zoning sales first so the 80-row cap retains the most relevant candidates.
            `SELECT ${analysisColumns} FROM property_sales_raw WHERE UPPER(property_locality) = $1 AND contract_date >= $2 ORDER BY CASE WHEN UPPER(zoning) LIKE $3 THEN 0 ELSE 1 END, contract_date DESC LIMIT 80`,
            [subject.suburb, searchFromStr, zoningPrefix ?? '%'],
          )
          : Promise.resolve([]),
        zoningPrefix
          ? this.dataSource.query(
            `SELECT ${analysisColumns} FROM property_sales_raw WHERE UPPER(zoning) LIKE $1 AND contract_date >= $2 ORDER BY contract_date DESC LIMIT 60`,
            [zoningPrefix, searchFromStr],
          )
          : Promise.resolve([]),
      ]);

      const seen = new Set(tier1.map((r: Record<string, unknown>) => r.id));
      const candidates = [
        ...tier1,
        ...(tier2 as Record<string, unknown>[]).filter((r) => !seen.has(r.id)),
      ].slice(0, MAX_CANDIDATE_SALES);

      this.logEvent('GENERATE.prefetch', { correlationId, count: candidates.length, durationMs: Date.now() - preT });
      return candidates;
    } catch (err) {
      this.logger.warn('[GENERATE] Pre-fetch failed — Claude will query via MCP', (err as Error).message);
      return [];
    }
  }

  private buildUserPrompt(
    subject: SubjectContext,
    candidates: Record<string, unknown>[],
  ): string {
    const yoyPct = subject.vgValuePrior > 0
      ? (((subject.vgValueCurrent - subject.vgValuePrior) / subject.vgValuePrior) * 100).toFixed(1)
      : 'N/A';
    const vgRatePerSqm = subject.landAreaSqm && subject.landAreaSqm > 0
      ? (subject.vgValueCurrent / subject.landAreaSqm).toFixed(0)
      : 'unknown';
    const vgPriorRatePerSqm = subject.landAreaSqm && subject.landAreaSqm > 0
      ? (subject.vgValuePrior / subject.landAreaSqm).toFixed(0)
      : 'unknown';

    const subjectLines = [
      subject.lotDp ? `- Lot/DP: ${subject.lotDp}` : null,
      `- PID: ${subject.pid}`,
      subject.suburb ? `- Suburb: ${subject.suburb}` : null,
      subject.landAreaSqm ? `- Land area: ${subject.landAreaSqm.toLocaleString()}m²${subject.landAreaVgSqm ? ` (VG used ${subject.landAreaVgSqm.toLocaleString()}m² — possible factual error)` : ''}` : null,
      subject.dimensions ? `- Dimensions: ${subject.dimensions}` : null,
      `- Zoning: ${subject.zoning}`,
      subject.heightLimitM ? `- Height limit: ${subject.heightLimitM}m` : null,
      subject.vgValueCurrent ? `- VG land value current year: $${subject.vgValueCurrent.toLocaleString()} ($${vgRatePerSqm}/m²)` : null,
      subject.vgValuePrior ? `- VG land value prior year: $${subject.vgValuePrior.toLocaleString()} ($${vgPriorRatePerSqm}/m²)` : null,
      subject.vgValuePrior ? `- YoY increase: +${yoyPct}%` : null,
      `- Valuation date: ${subject.valuationDate}`,
    ].filter(Boolean).join('\n');

    const hasCandidates = candidates.length > 0;

    return `Analyse comparable sales for the following subject property for a land tax objection:

${subjectLines}

${hasCandidates
        ? `Pre-fetched candidate sales (${candidates.length} records from the database):
${JSON.stringify(candidates)}

Select the best comparables from the pre-fetched list above. If after applying size and time adjustments (see below) the pre-fetched set contains fewer than 5 same-zoning candidates with an adjusted rate at or below the VG rate of $${vgRatePerSqm}/m², you MUST use the search_comparable_sales MCP tool to broaden the search to nearby industrial suburbs (e.g. Moorebank, Casula, Chipping Norton, Ingleburn, Minto, Prestons) before finalising your selection. Use database tools at most 3 times per analysis.`
        : `Query property_sales_raw via the search_comparable_sales MCP tool for comparable sales in the same or nearby catchment with matching or similar zoning. If the first search returns fewer than 5 same-zoning candidates with an adjusted rate at or below the VG rate of $${vgRatePerSqm}/m², widen the catchment to nearby industrial suburbs. Use database tools at most 3 times per analysis.`}

Return ONLY a valid JSON array — no markdown, no prose, no code fences. Each element must contain exactly these fields:
id, property_id, district_code, property_house_number, property_street_name, property_locality, property_post_code, area, zoning, nature_of_property, primary_purpose, component_code, sale_code, interest_of_sale_percent, contract_date, purchase_price, dealing_number, owner_type, adjusted_rate_per_sqm, adjusted_land_value, suggested_land_value, explanation.

Omit all other columns. Computed fields:
- adjusted_rate_per_sqm: Derive the fully adjusted land rate per m² using these steps in order (null if area is zero or null):
  Step 1 — Normalise area: if area < 100, treat as hectares (multiply by 10000).
  Step 2 — Land-only rate:
    • Vacant land (primary_purpose is null/blank or indicates vacant; or nature_of_property = 'V'): land_rate = purchase_price ÷ area.
    • Improved sales: apply DRC improvement stripping — estimate depreciated replacement cost of improvements (industrial/warehouse: $600–900/m² GFA; if GFA unknown use 40–60% of purchase price as improvement value) and deduct before dividing by area. Flag the estimate in the explanation.
  Step 3 — Size adjustment: adjust the land_rate for the size difference relative to the subject (${subject.landAreaSqm}m²).
    size_factor = (${subject.landAreaSqm} / comparable_area) ^ 0.15
    size_adjusted_rate = land_rate × size_factor
    (This reflects that larger sites sell at a lower per-m² rate than smaller sites.)
  Step 4 — Time adjustment: adjust for the period between the sale date and the valuation date (${subject.valuationDate}).
    months_diff = months from contract_date to valuation date
    If months_diff ≤ 12: no time adjustment (neutral market assumed).
    If months_diff > 12: time_factor = 1 + (months_diff × 0.003) — apply a modest +0.3%/month upward trend for industrial land.
    adjusted_rate_per_sqm = round(size_adjusted_rate × time_factor)
  The final adjusted_rate_per_sqm is the size-and-time-adjusted land rate, directly comparable to the VG's assessed rate of $${vgRatePerSqm}/m².
- adjusted_land_value: round(adjusted_rate_per_sqm × comparable_area) — the comparable's OWN land value in dollars after all adjustments. This is what this comparable sale's land is worth. Null if adjusted_rate_per_sqm or area is null.
- suggested_land_value: round(adjusted_rate_per_sqm × ${subject.landAreaSqm}) — the implied land value of the SUBJECT property (${subject.landAreaSqm}m²) based on this comparable's adjusted rate. This is the dollar figure a valuer would use as the suggested land value supported by this sale. Null if adjusted_rate_per_sqm is null.
- explanation: A plain-text multi-line string (use actual newline characters \n — no markdown, no HTML). Format exactly as:
  Line 1: "Rank N — [full address] | [zoning] | [Vacant Land / Improved - primary_purpose]"
  Line 2: "• Sale: [contract date DD Mon YYYY] — $[purchase_price formatted] ([area]m²)"
  Line 3: "• Raw land rate: $[land_rate]/m²" (for improved sales, append " (after improvement deduction of $[deduction_amount])")
  Line 4: "• Size adjustment: factor [size_factor 3dp] ([subject area]m² subject vs [comparable area]m² comparable) → $[size_adjusted_rate]/m²"
  Line 5: "• Time adjustment: [N months] — [nil (within 12-month window) | +X% ([factor 3dp])] → $[adjusted_rate_per_sqm]/m²"
  Line 6: "• Adjusted rate: $[adjusted_rate_per_sqm]/m² vs VG rate $${vgRatePerSqm}/m² → [Supports objection ✓ | Does NOT support objection ✗]"
  Line 7: "• Suggested land value: $[suggested_land_value formatted with commas]"
  Line 8 (only if caveats exist): "• Caveats: [flagged sale code / estimated improvement deduction / zoning mismatch / etc.]"

Sort from most comparable (index 0) to least. Zoning compatibility is the primary criterion — sales from a different zoning class (e.g. residential R2 vs industrial E5) must be ranked below ALL same-zoning comparables regardless of vacancy or location, and should only be included if no same-zoning evidence exists within a reasonable catchment. Ranking hierarchy (apply in order):
1. Vacant, same zoning, same suburb
2. Improved, same zoning, same suburb
3. Vacant, same zoning, nearby suburb / wider catchment
4. Improved, same zoning, nearby suburb / wider catchment
5. Vacant or improved, compatible zoning (e.g. E4 if subject is E5), same or nearby suburb
6. Different zoning class — only as a last resort; flag clearly that the zoning difference makes the comparison unreliable
Within each tier: no sale code flag > flagged, more recent > older, similar size > dissimilar. Strongly prefer vacant land sales within the same zoning as they provide direct land value evidence without improvement stripping.

Return a maximum of 10 comparables. Quality over quantity — include only sales where the derived land rate can be reliably determined. Deprioritise improved sales with sale code flags unless no better evidence exists.`;
  }

  private async callAnthropicApi(
    systemPrompt: string,
    userPrompt: string,
    mcpUrl: string | null,
    mcpToken: string | null,
    correlationId?: string,
    disputeCaseId?: string,
  ): Promise<{ text: string; usage: AnthropicApiResponse['usage'] }> {
    const anthropicT = Date.now();
    let response: AxiosResponse<AnthropicApiResponse>;
    try {
      response = await axios.post<AnthropicApiResponse>(
        this.configService.getOrThrow<string>('ANTHROPIC_API_URL'),
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          system: [
            {
              type: 'text',
              text: systemPrompt,
              cache_control: { type: 'ephemeral' },
            },
          ],
          ...(mcpUrl && mcpToken ? {
            mcp_servers: [
              {
                type: 'url',
                url: mcpUrl,
                name: 'postgres',
                authorization_token: mcpToken,
              },
            ],
          } : {}),
          messages: [{ role: 'user', content: userPrompt }],
        },
        {
          headers: {
            'x-api-key': this.configService.get<string>('ANTHROPIC_API_KEY'),
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'mcp-client-2025-04-04,prompt-caching-2024-07-31',
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const body = err.response?.data as AnthropicErrorBody | undefined;
        this.logEvent('GENERATE.anthropic_error', {
          correlationId,
          status,
          errorType: body?.error?.type,
          errorMessage: body?.error?.message ?? err.message,
        });
        if (status === 529 || status === 503) {
          throw new LlmApiException('Anthropic API is temporarily overloaded. Please retry in a few seconds.', 503);
        }
        if (status === 401) {
          throw new LlmApiException('Anthropic API key is invalid or expired.', 502);
        }
      }
      throw err;
    }

    const { stop_reason, content, usage } = response.data;
    console.log('GENERATE.token_usage', {
      correlationId,
      disputeCaseId,
      model: 'claude-sonnet-4-6',
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
      durationMs: Date.now() - anthropicT,
      stop_reason,
    });

    if (stop_reason === 'max_tokens') {
      throw {
        correlationId,
        disputeCaseId,
        model: 'claude-sonnet-4-6',
        input_tokens: usage?.input_tokens ?? 0,
        output_tokens: usage?.output_tokens ?? 0,
        cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
        durationMs: Date.now() - anthropicT,
        stop_reason,
      }
      this.logger.error('[GENERATE] Response was truncated at max_tokens — increase max_tokens or reduce result set');
      throw new LlmTruncationException();
    }
    if (stop_reason === 'tool_use') {
      this.logEvent('GENERATE.unexpected_tool_use', { correlationId, disputeCaseId });
      throw {
        correlationId,
        disputeCaseId,
        model: 'claude-sonnet-4-6',
        input_tokens: usage?.input_tokens ?? 0,
        output_tokens: usage?.output_tokens ?? 0,
        cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
        durationMs: Date.now() - anthropicT,
        stop_reason,
      }
      throw new LlmToolUseException();
    }

    const textBlock = content?.findLast((b) => b.type === 'text');
    if (!textBlock) this.logger.warn('[GENERATE] No text block found in response content');
    return { text: textBlock?.text ?? '', usage };
  }

  private extractJsonArray(raw: string): Record<string, unknown>[] {
    // Find the first '[' that begins a JSON array ('{' or ']' follows after whitespace).
    // Skips prose like "[Tool call: ...]" that the MCP beta sometimes emits in text blocks.
    let arrayStart = -1;
    for (let i = raw.indexOf('['); i !== -1; i = raw.indexOf('[', i + 1)) {
      const next = raw.slice(i + 1).trimStart();
      if (next.startsWith('{') || next.startsWith(']')) { arrayStart = i; break; }
    }
    if (arrayStart === -1) {
      this.logger.error('[GENERATE] Could not locate JSON array in response', raw.slice(0, 200));
      throw new LlmParseException('response did not contain a JSON array');
    }

    // Walk the string with bracket depth to find the matching closing ']'.
    // Using lastIndexOf(']') would pick up brackets in trailing prose (e.g. "[flagged]").
    let arrayEnd = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = arrayStart; i < raw.length; i++) {
      const ch = raw[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) { continue; }
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') { if (--depth === 0) { arrayEnd = i; break; } }
    }
    if (arrayEnd === -1) {
      this.logger.error('[GENERATE] Could not find closing bracket for JSON array', raw.slice(0, 200));
      throw new LlmParseException('JSON array was not properly closed');
    }

    return JSON.parse(raw.slice(arrayStart, arrayEnd + 1)) as Record<string, unknown>[];
  }

  private async persistComparables(
    parsed: Record<string, unknown>[],
    disputeCaseId: string,
    createdById: string,
  ): Promise<ComparableResponseDto[]> {
    const toSave = parsed.map((item) =>
      this.comparablesRepository.create({
        dispute_case_id: disputeCaseId,
        created_by_id: createdById,
        sale_id: item.id != null ? String(item.id) : null,
        source_file: (item.source_file as string) ?? null,
        imported_at: item.imported_at ? new Date(item.imported_at as string) : null,
        district_code: (item.district_code as string) ?? null,
        property_id: (item.property_id as string) ?? null,
        sale_counter: item.sale_counter != null ? Number(item.sale_counter) : null,
        download_datetime: item.download_datetime ? new Date(item.download_datetime as string) : null,
        property_name: (item.property_name as string) ?? null,
        property_unit_number: (item.property_unit_number as string) ?? null,
        property_house_number: (item.property_house_number as string) ?? null,
        property_street_name: (item.property_street_name as string) ?? null,
        property_locality: (item.property_locality as string) ?? null,
        property_post_code: (item.property_post_code as string) ?? null,
        area: item.area != null ? Number(item.area) : null,
        contract_date: item.contract_date ? new Date(item.contract_date as string) : null,
        settlement_date: item.settlement_date ? new Date(item.settlement_date as string) : null,
        purchase_price: item.purchase_price != null ? Number(item.purchase_price) : null,
        zoning: (item.zoning as string) ?? null,
        nature_of_property: (item.nature_of_property as string) ?? null,
        primary_purpose: (item.primary_purpose as string) ?? null,
        strata_lot_number: (item.strata_lot_number as string) ?? null,
        component_code: (item.component_code as string) ?? null,
        sale_code: (item.sale_code as string) ?? null,
        interest_of_sale_percent: item.interest_of_sale_percent != null ? Number(item.interest_of_sale_percent) : null,
        dealing_number: (item.dealing_number as string) ?? null,
        owner_type: (item.owner_type as string) ?? null,
        adjusted_rate_per_sqm: item.adjusted_rate_per_sqm != null ? Number(item.adjusted_rate_per_sqm) : null,
        adjusted_land_value: item.adjusted_land_value != null ? Number(item.adjusted_land_value) : null,
        suggested_land_value: item.suggested_land_value != null ? Number(item.suggested_land_value) : null,
        explanation: (item.explanation as string) ?? null,
      }),
    );

    const saved = await this.comparablesRepository.save(toSave);
    return plainToInstance(ComparableResponseDto, saved);
  }

  private async assertDisputeCaseExists(disputeCaseId: string): Promise<void> {
    const exists = await this.disputeCasesRepository.existsBy({ id: disputeCaseId });
    if (!exists) {
      throw new DisputeCaseNotFoundException(disputeCaseId);
    }
  }

  private assertSaleDateNotFuture(saleDateStr: string): void {
    const saleDate = new Date(saleDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (saleDate > today) {
      throw new FutureSaleDateException(saleDateStr);
    }
  }
}
