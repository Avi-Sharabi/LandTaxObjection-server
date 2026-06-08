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
import { MissingValuationDateException } from './exceptions/missing-valuation-date.exception';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { McpService } from '../../mcp/mcp.service';
import { buildUserPrompt, SubjectContext } from './comparables.prompts';


const MAX_CANDIDATE_SALES = 80;

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

  async findRawByDisputeCaseId(disputeCaseId: string): Promise<ComparableSale[]> {
    return this.comparablesRepository.find({
      where: { dispute_case_id: disputeCaseId },
    });
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
    this.logEvent('GENERATE.subject', { correlationId, subject });
    const candidates = await this.prefetchCandidateSales(subject, correlationId);
    const userPrompt = buildUserPrompt(subject, candidates);
    const systemPrompt = `${this.skillContent}\n\n## property_sales_raw schema (do NOT call list_tables or describe_table — query directly)\n\`\`\`\n${this.schemaBlock}\n\`\`\``;

    this.logEvent('GENERATE.anthropic.start', { correlationId, systemPromptLength: systemPrompt.length });
    const { text: rawText, usage } = await this.callAnthropicApi(systemPrompt, userPrompt, mcpUrl, mcpToken, correlationId, dto.dispute_case_id);
    const parsed = this.extractJsonArray(rawText);

    const candidateMap = new Map(candidates.map(c => [String(c.id), c]));
    const enriched = parsed.map(item => {
      const candidate = candidateMap.get(String(item.id)) ?? item;
      return { ...candidate, ...this.computeAdjustedFields(candidate, subject) };
    });

    this.logEvent('GENERATE.persist', { correlationId, count: enriched.length });
    const saved = await this.persistComparables(enriched, dto.dispute_case_id, createdById);
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
      suburb: (dto.suburb ?? disputeCase.property?.suburb ?? '').trim().toUpperCase(),
      postcode: dto.postcode ?? disputeCase.property?.postcode ?? null,
      landAreaSqm: dto.land_area_sqm ?? (Number(disputeCase.property?.land_area_sqm) || null),
      zoning: dto.zoning ?? disputeCase.property?.zoning ?? 'unknown',
      lotDp: dto.lot_dp ?? disputeCase.property?.lot_dp ?? null,
      dimensions: dto.dimensions ?? disputeCase.property?.dimensions ?? null,
      heightLimitM: dto.height_limit_m ?? disputeCase.property?.height_limit_m ?? null,
      vgValueCurrent: dto.vg_land_value_current ?? (Number(vn?.assessed_land_value) || 0),
      vgValuePrior: dto.vg_land_value_prior ?? (Number(vn?.prior_land_value) || 0),
      landAreaVgSqm: dto.land_area_vg_sqm ?? (Number(vn?.land_area_vg_sqm) || null),
      valuationDate: dto.valuation_date
        ?? (vn?.valuation_date ? new Date(vn.valuation_date).toISOString().split('T')[0] : null) ?? (() => { throw new MissingValuationDateException(disputeCase.id); })(),
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
      searchFrom.setFullYear(searchFrom.getFullYear() - 5);
      const searchFromStr = isNaN(searchFrom.getTime())
        ? new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : searchFrom.toISOString().split('T')[0];

      const zoningPrefix = subject.zoning !== 'unknown' ? subject.zoning.substring(0, 2).toUpperCase() + '%' : null;

      // Select only the columns needed for analysis — avoids sending metadata columns
      // (source_file, imported_at, download_datetime, sale_counter, etc.) to the LLM.
      const analysisColumns = `id, property_id, district_code, property_house_number, property_street_name,
        property_locality, property_post_code, area, zoning, nature_of_property,
        primary_purpose, component_code, sale_code, interest_of_sale_percent,
        contract_date, purchase_price, dealing_number, owner_type`;

      const postcodePrefix = subject.postcode ? subject.postcode.substring(0, 3) + '%' : null;

      const [tier1, tier2, tier3] = await Promise.all([
        // Tier 1: Same suburb, any zoning (same-zoning sorted first)
        subject.suburb
          ? this.dataSource.query(
            `SELECT ${analysisColumns} FROM property_sales_raw WHERE UPPER(property_locality) = $1 AND contract_date >= $2 ORDER BY CASE WHEN UPPER(zoning) LIKE $3 THEN 0 ELSE 1 END, contract_date DESC LIMIT 120`,
            [subject.suburb, searchFromStr, zoningPrefix ?? '%'],
          )
          : Promise.resolve([]),
        // Tier 2: Same postcode (covers adjoining suburbs in the same locality), same zoning
        subject.postcode && zoningPrefix
          ? this.dataSource.query(
            `SELECT ${analysisColumns} FROM property_sales_raw WHERE property_post_code = $1 AND UPPER(zoning) LIKE $2 AND contract_date >= $3 ORDER BY contract_date DESC LIMIT 80`,
            [subject.postcode, zoningPrefix, searchFromStr],
          )
          : Promise.resolve([]),
        // Tier 3: Broader postcode corridor (same first 3 digits), same zoning
        postcodePrefix && zoningPrefix
          ? this.dataSource.query(
            `SELECT ${analysisColumns} FROM property_sales_raw WHERE property_post_code LIKE $1 AND UPPER(zoning) LIKE $2 AND contract_date >= $3 ORDER BY contract_date DESC LIMIT 60`,
            [postcodePrefix, zoningPrefix, searchFromStr],
          )
          : Promise.resolve([]),
      ]);

      const seen = new Set<unknown>();
      const candidates: Record<string, unknown>[] = [];
      for (const row of [...tier1, ...tier2, ...tier3]) {
        if (!seen.has((row as Record<string, unknown>).id)) {
          seen.add((row as Record<string, unknown>).id);
          candidates.push(row as Record<string, unknown>);
          if (candidates.length >= MAX_CANDIDATE_SALES) break;
        }
      }

      this.logEvent('GENERATE.prefetch', { correlationId, count: candidates.length, durationMs: Date.now() - preT });
      return candidates;
    } catch (err) {
      this.logger.warn('[GENERATE] Pre-fetch failed — Claude will query via MCP', (err as Error).message);
      return [];
    }
  }

  private computeAdjustedFields(
    candidate: Record<string, unknown>,
    subject: SubjectContext,
  ): {
    adjusted_rate_per_sqm: number | null;
    adjusted_land_value: number | null;
    suggested_land_value: number | null;
    explanation: string | null;
  } {
    const purchasePrice = candidate.purchase_price != null ? Number(candidate.purchase_price) : null;
    let area = candidate.area != null ? Number(candidate.area) : null;
    if (!purchasePrice || !area || !subject.landAreaSqm) return { adjusted_rate_per_sqm: null, adjusted_land_value: null, suggested_land_value: null, explanation: null };

    if (area < 100) area = Math.round(area * 10000);

    const isVacant = !candidate.primary_purpose ||
      String(candidate.primary_purpose).trim() === '' ||
      candidate.nature_of_property === 'V';

    let improvementDeduction = 0;
    let landRate: number;
    if (isVacant) {
      landRate = purchasePrice / area;
    } else {
      improvementDeduction = Math.round(purchasePrice * 0.5);
      landRate = (purchasePrice - improvementDeduction) / area;
    }

    const sizeFactor = Math.pow(subject.landAreaSqm / area, 0.15);
    const sizeAdjustedRate = landRate * sizeFactor;

    const contractDate = candidate.contract_date ? new Date(candidate.contract_date as string) : null;
    const valuationDate = new Date(subject.valuationDate);
    let monthsDiff = 0;
    let timeFactor = 1;
    if (contractDate && !isNaN(contractDate.getTime())) {
      monthsDiff = (valuationDate.getFullYear() - contractDate.getFullYear()) * 12
        + (valuationDate.getMonth() - contractDate.getMonth());
      if (monthsDiff > 12) timeFactor = 1 + monthsDiff * 0.003;
    }

    const adjusted_rate_per_sqm = Math.round(sizeAdjustedRate * timeFactor);
    const adjusted_land_value = Math.round(adjusted_rate_per_sqm * area);
    const suggested_land_value = Math.round(adjusted_rate_per_sqm * subject.landAreaSqm);

    const vgRate = Math.round(subject.vgValueCurrent / subject.landAreaSqm);
    const supportsObjection = adjusted_rate_per_sqm <= vgRate;
    const address = [candidate.property_house_number, candidate.property_street_name, candidate.property_locality].filter(Boolean).join(' ');
    const saleDateStr = contractDate && !isNaN(contractDate.getTime())
      ? contractDate.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'Unknown date';

    const sameSuburb = subject.suburb &&
      String(candidate.property_locality ?? '').trim().toUpperCase() === subject.suburb.toUpperCase();
    const areaRatioPct = Math.round(Math.abs(area - subject.landAreaSqm) / subject.landAreaSqm * 100);
    const similarityLine = [
      sameSuburb ? 'Same suburb' : 'Nearby suburb',
      `same ${candidate.zoning} zoning`,
      `${areaRatioPct}% ${area > subject.landAreaSqm ? 'larger' : 'smaller'} (${area.toLocaleString()}m² vs ${subject.landAreaSqm.toLocaleString()}m² subject)`,
    ].join(' · ');

    const conclusionLine = supportsObjection
      ? `The adjusted rate of $${adjusted_rate_per_sqm.toLocaleString()}/m² is below the VG's assessed rate of $${vgRate.toLocaleString()}/m², supporting a lower land value for your property.`
      : `The adjusted rate of $${adjusted_rate_per_sqm.toLocaleString()}/m² is above the VG's assessed rate of $${vgRate.toLocaleString()}/m² — this sale does not directly support a lower value but is included as market context.`;

    const explanation = [
      `${address} | ${candidate.zoning} | ${isVacant ? 'Vacant Land' : `Improved - ${candidate.primary_purpose}`}`,
      similarityLine,
      `• Sale: ${saleDateStr} — $${purchasePrice.toLocaleString()} (${area}m²)`,
      `• Raw land rate: $${Math.round(landRate).toLocaleString()}/m²${!isVacant ? ` (after improvement deduction of $${improvementDeduction.toLocaleString()})` : ''}`,
      `• Size adjustment: factor ${sizeFactor.toFixed(3)} (${subject.landAreaSqm}m² subject vs ${area}m² comparable) → $${Math.round(sizeAdjustedRate).toLocaleString()}/m²`,
      `• Time adjustment: ${monthsDiff} months — ${monthsDiff <= 12 ? 'nil (within 12-month window)' : `+${((timeFactor - 1) * 100).toFixed(1)}% (factor ${timeFactor.toFixed(3)})`} → $${adjusted_rate_per_sqm.toLocaleString()}/m²`,
      `• Adjusted rate: $${adjusted_rate_per_sqm.toLocaleString()}/m² vs VG rate $${vgRate.toLocaleString()}/m² → ${supportsObjection ? 'Supports objection ✓' : 'Does NOT support objection ✗'}`,
      `• Suggested land value: $${suggested_land_value.toLocaleString()}`,
      !isVacant ? `• Caveats: Improvement deduction estimated at 50% of purchase price ($${improvementDeduction.toLocaleString()}) — GFA unavailable` : null,
      conclusionLine,
    ].filter(Boolean).join('\n');

    return { adjusted_rate_per_sqm, adjusted_land_value, suggested_land_value, explanation };
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
    const body = {
      model: 'claude-sonnet-4-6',
      max_tokens: 32000,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      ...(mcpUrl && mcpToken ? { mcp_servers: [{ type: 'url', url: mcpUrl, name: 'postgres', authorization_token: mcpToken }] } : {}),
      messages: [{ role: 'user', content: userPrompt }],
    };
    const headers = {
      'x-api-key': this.configService.get<string>('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'mcp-client-2025-04-04,prompt-caching-2024-07-31',
      'Content-Type': 'application/json',
    };
    const apiUrl = this.configService.getOrThrow<string>('ANTHROPIC_API_URL');

    let response: AxiosResponse<AnthropicApiResponse> | undefined;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await axios.post<AnthropicApiResponse>(apiUrl, body, { headers, timeout: 300000 });
        break;
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          const errBody = err.response?.data as AnthropicErrorBody | undefined;
          const errMsg = errBody?.error?.message ?? err.message;
          this.logEvent('GENERATE.anthropic_error', { correlationId, attempt, status, errorType: errBody?.error?.type, errorMessage: errMsg });
          if (status === 429 && attempt < maxRetries) {
            const waitMatch = errMsg.match(/wait (\d+) second/i);
            const waitSec = waitMatch ? parseInt(waitMatch[1], 10) + 2 : 65;
            this.logger.warn(`[GENERATE] 429 rate limit — waiting ${waitSec}s then retrying (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
            continue;
          }
          // Timeout or network error — no response received; retry without waiting
          if (!status && attempt < maxRetries) {
            this.logger.warn(`[GENERATE] Network timeout on attempt ${attempt}/${maxRetries} — retrying`);
            continue;
          }
          if (status === 529 || status === 503) throw new LlmApiException('Anthropic API is temporarily overloaded. Please retry in a few seconds.', 503);
          if (status === 401) throw new LlmApiException('Anthropic API key is invalid or expired.', 502);
        }
        throw err;
      }
    }

    if (!response) throw new LlmApiException('No response received after retries', 503);
    const { stop_reason, content, usage } = response.data;
    this.logEvent('GENERATE.token_usage', {
      correlationId,
      disputeCaseId,
      model: body.model,
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
      durationMs: Date.now() - anthropicT,
      stop_reason,
    });

    if (stop_reason === 'max_tokens') {
      this.logger.error('[GENERATE] Response was truncated at max_tokens — increase max_tokens or reduce result set');
      throw new LlmTruncationException();
    }
    if (stop_reason === 'tool_use') {
      this.logEvent('GENERATE.unexpected_tool_use', { correlationId, disputeCaseId });
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
