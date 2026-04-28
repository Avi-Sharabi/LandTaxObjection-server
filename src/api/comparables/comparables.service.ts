import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
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
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { McpService } from '../../mcp/mcp.service';

interface AnthropicErrorBody {
  type: string;
  error: { type: string; message: string };
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
    _serverUrl: string,
    correlationId?: string,
  ): Promise<ComparableResponseDto[]> {
    const start = Date.now();
    const mcpToken = this.configService.getOrThrow<string>('MCP_SECRET_TOKEN');
    // MCP_PUBLIC_URL must be a publicly reachable URL (e.g. https://api.example.com).
    // Omit when running locally — Anthropic's cloud cannot reach localhost.
    const mcpPublicUrl = this.configService.get<string>('MCP_PUBLIC_URL');
    const mcpUrl = mcpPublicUrl ? `${mcpPublicUrl}/api/mcp` : null;
    this.logEvent('GENERATE.start', { correlationId, disputeCaseId: dto.dispute_case_id, mcpUrl: mcpUrl ?? 'disabled (no MCP_PUBLIC_URL)' });

    // Validate dispute case and load property + valuation notice for fallback values
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id: dto.dispute_case_id },
      relations: ['property', 'valuation_notice'],
    });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${dto.dispute_case_id} not found`);

    // Resolve all subject property data — DTO takes priority, DB as fallback
    const pid           = dto.pid            ?? disputeCase.property?.pid           ?? 'unknown';
    const suburb        = (disputeCase.property?.suburb ?? '').trim().toUpperCase();
    const landAreaSqm   = dto.land_area_sqm  ?? (Number(disputeCase.property?.land_area_sqm) || null);
    const zoning        = dto.zoning         ?? disputeCase.property?.zoning        ?? 'unknown';
    const lotDp         = dto.lot_dp         ?? disputeCase.property?.lot_dp        ?? null;
    const dimensions    = dto.dimensions     ?? disputeCase.property?.dimensions    ?? null;
    const heightLimitM  = dto.height_limit_m ?? disputeCase.property?.height_limit_m ?? null;

    const vn = disputeCase.valuation_notice;
    const vgValueCurrent = dto.vg_land_value_current ?? (Number(vn?.assessed_land_value) || 0);
    const vgValuePrior   = dto.vg_land_value_prior   ?? (Number(vn?.prior_land_value)    || 0);
    const landAreaVgSqm  = dto.land_area_vg_sqm      ?? (Number(vn?.land_area_vg_sqm)    || null);
    const valuationDate  = dto.valuation_date
      ?? (vn?.valuation_date ? new Date(vn.valuation_date).toISOString().split('T')[0] : '1 July 2025');

    const yoyPct = vgValuePrior > 0
      ? (((vgValueCurrent - vgValuePrior) / vgValuePrior) * 100).toFixed(1)
      : 'N/A';
    const vgRatePerSqm = landAreaSqm && landAreaSqm > 0
      ? (vgValueCurrent / landAreaSqm).toFixed(0)
      : 'unknown';
    const vgPriorRatePerSqm = landAreaSqm && landAreaSqm > 0
      ? (vgValuePrior / landAreaSqm).toFixed(0)
      : 'unknown';

    const subjectLines = [
      lotDp        ? `- Lot/DP: ${lotDp}` : null,
      `- PID: ${pid}`,
      suburb       ? `- Suburb: ${suburb}` : null,
      landAreaSqm  ? `- Land area: ${landAreaSqm.toLocaleString()}m²${landAreaVgSqm ? ` (VG used ${landAreaVgSqm.toLocaleString()}m² — possible factual error)` : ''}` : null,
      dimensions   ? `- Dimensions: ${dimensions}` : null,
      `- Zoning: ${zoning}`,
      heightLimitM ? `- Height limit: ${heightLimitM}m` : null,
      vgValueCurrent ? `- VG land value current year: $${vgValueCurrent.toLocaleString()} ($${vgRatePerSqm}/m²)` : null,
      vgValuePrior   ? `- VG land value prior year: $${vgValuePrior.toLocaleString()} ($${vgPriorRatePerSqm}/m²)` : null,
      vgValuePrior   ? `- YoY increase: +${yoyPct}%` : null,
      `- Valuation date: ${valuationDate}`,
    ].filter(Boolean).join('\n');

    // Pre-fetch candidate sales so Claude can analyse immediately without MCP round-trips.
    // Tier 1 (same suburb) and Tier 2 (same zoning family) run in parallel to save one DB round-trip.
    // Each MCP call via Azure adds 30s–2min of latency; pre-fetching eliminates most of them.
    const preT = Date.now();
    let candidateSales: Record<string, unknown>[] = [];
    try {
      const vd = new Date(valuationDate);
      const searchFrom = new Date(vd);
      searchFrom.setFullYear(searchFrom.getFullYear() - 3);
      const searchFromStr = isNaN(searchFrom.getTime())
        ? new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : searchFrom.toISOString().split('T')[0];

      const zoningPrefix = zoning !== 'unknown' ? zoning.substring(0, 2).toUpperCase() + '%' : null;

      // Select only the columns needed for analysis — avoids sending metadata columns
      // (source_file, imported_at, download_datetime, sale_counter, etc.) to the LLM.
      const analysisColumns = `id, property_id, district_code, property_house_number, property_street_name,
        property_locality, property_post_code, area, zoning, nature_of_property,
        primary_purpose, component_code, sale_code, interest_of_sale_percent,
        contract_date, purchase_price, dealing_number, owner_type`;

      const [tier1, tier2] = await Promise.all([
        suburb
          ? this.dataSource.query(
              `SELECT ${analysisColumns} FROM property_sales_raw WHERE UPPER(property_locality) = $1 AND contract_date >= $2 ORDER BY contract_date DESC LIMIT 80`,
              [suburb, searchFromStr],
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
      candidateSales = [
        ...tier1,
        ...(tier2 as Record<string, unknown>[]).filter((r) => !seen.has(r.id)),
      ].slice(0, 100);

      this.logEvent('GENERATE.prefetch', { correlationId, count: candidateSales.length, durationMs: Date.now() - preT });
    } catch (err) {
      this.logger.warn('[GENERATE] Pre-fetch failed — Claude will query via MCP', (err as Error).message);
    }

    const hasCandidates = candidateSales.length > 0;
    const systemPrompt = `${this.skillContent}\n\n## property_sales_raw schema (do NOT call list_tables or describe_table — query directly)\n\`\`\`\n${this.schemaBlock}\n\`\`\``;
    this.logEvent('GENERATE.anthropic.start', { correlationId, systemPromptLength: systemPrompt.length });

    const anthropicT = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: AxiosResponse<any>;
    try {
      response = await axios.post(
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
          ...(mcpUrl ? {
            mcp_servers: [
              {
                type: 'url',
                url: mcpUrl,
                name: 'postgres',
                authorization_token: mcpToken,
              },
            ],
          } : {}),
          messages: [
            {
              role: 'user',
              content: `Analyse comparable sales for the following subject property for a land tax objection:

${subjectLines}

${hasCandidates
  ? `Pre-fetched candidate sales (${candidateSales.length} records from the database):
${JSON.stringify(candidateSales)}

Select the best comparables from the pre-fetched list above. Only use the search_comparable_sales MCP tool if you need sales from a different suburb, wider date range, or zoning type not covered in this set. Use database tools at most 3 times per analysis.`
  : `Query property_sales_raw via the search_comparable_sales MCP tool for comparable sales in the same or nearby catchment with matching or similar zoning. Use database tools at most 3 times per analysis.`}

Return ONLY a valid JSON array — no markdown, no prose, no code fences. Each element must contain exactly these fields:
id, property_id, district_code, property_house_number, property_street_name, property_locality, property_post_code, area, zoning, nature_of_property, primary_purpose, component_code, sale_code, interest_of_sale_percent, contract_date, purchase_price, dealing_number, owner_type, adjusted_rate_per_sqm, explanation.

Omit all other columns. Computed fields:
- adjusted_rate_per_sqm: purchase_price ÷ area (null if area is zero or null). If area < 100, treat as hectares (multiply by 10000 first).
- explanation: "Rank N — " followed by 2 sentences as a valuer would write in an objection submission: sentence 1 covers location, zoning, sale date and price; sentence 2 covers area relative to subject, the adjusted rate per m², and whether this sale supports or challenges the VG's rate of $${vgRatePerSqm}/m².

Sort from most comparable (index 0) to least. Ranking hierarchy: vacant same suburb > improved same suburb > vacant nearby > improved nearby > wider region. Within tier: no sale code flag > flagged, more recent > older, similar size > dissimilar.

Return a maximum of 10 comparables. Quality over quantity — include only sales that genuinely inform the analysis.`,
            },
          ],
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

      const stopReason = response.data?.stop_reason as string | undefined;
      const usage = response.data?.usage as {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      } | undefined;

      this.logEvent('GENERATE.token_usage', {
        correlationId,
        disputeCaseId: dto.dispute_case_id,
        model: 'claude-sonnet-4-6',
        input_tokens: usage?.input_tokens ?? 0,
        output_tokens: usage?.output_tokens ?? 0,
        cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
        durationMs: Date.now() - anthropicT,
        stop_reason: stopReason,
      });

      if (stopReason === 'max_tokens') {
        this.logger.error('[GENERATE] Response was truncated at max_tokens — increase max_tokens or reduce result set');
        throw new Error('LLM output was truncated before the JSON array completed (max_tokens reached)');
      }
      if (stopReason === 'tool_use') {
        this.logEvent('GENERATE.unexpected_tool_use', { correlationId, disputeCaseId: dto.dispute_case_id });
        throw new Error('Anthropic returned stop_reason=tool_use unexpectedly — MCP server may not have handled the tool call');
      }
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
          throw new Error('Anthropic API is temporarily overloaded. Please retry in a few seconds.');
        }
        if (status === 401) {
          throw new Error('Anthropic API key is invalid or expired.');
        }
      }
      throw err;
    }

    const textBlock = response.data?.content?.findLast((b: { type: string; text?: string }) => b.type === 'text');
    if (!textBlock) this.logger.warn('[GENERATE] No text block found in response content');

    const raw = textBlock?.text ?? '';

    const arrayStart = raw.indexOf('[');
    const arrayEnd = raw.lastIndexOf(']');
    if (arrayStart === -1 || arrayEnd === -1 || arrayEnd < arrayStart) {
      this.logger.error('[GENERATE] Could not locate JSON array in response', raw.slice(0, 200));
      throw new Error('LLM response did not contain a JSON array');
    }
    const parsed: Record<string, unknown>[] = JSON.parse(raw.slice(arrayStart, arrayEnd + 1));
    this.logEvent('GENERATE.persist', { correlationId, count: parsed.length });

    const toSave = parsed.map((item) =>
      this.comparablesRepository.create({
        dispute_case_id: dto.dispute_case_id,
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
        explanation: (item.explanation as string) ?? null,
      }),
    );

    const saved = await this.comparablesRepository.save(toSave);
    this.logEvent('GENERATE.complete', {
      correlationId,
      disputeCaseId: dto.dispute_case_id,
      savedCount: saved.length,
      totalDurationMs: Date.now() - start,
    });
    return plainToInstance(ComparableResponseDto, saved);
  }

  private async assertDisputeCaseExists(disputeCaseId: string): Promise<void> {
    const exists = await this.disputeCasesRepository.existsBy({ id: disputeCaseId });
    if (!exists) {
      throw new NotFoundException(`Dispute case #${disputeCaseId} not found`);
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
