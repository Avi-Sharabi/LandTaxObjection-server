import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { AnthropicService } from '../../anthropic/anthropic.service';
import { ComparableSalesQueryDto, ComparableSalesSqlSearchDto } from './dto/comparable-sales.dto';
import { ComparableSalesSafetyCheckException } from './exceptions/comparable-sales-safety-check.exception';
import {
  ComparableSale,
  ComparableSalesAiQueryResponse,
  ComparableSalesResponse,
} from './comparable-sales.interface';
import { ComparableSalesRepository, SearchParams } from './comparable-sales.repository';

@Injectable()
export class ComparableSalesService {
  private readonly logger = new Logger(ComparableSalesService.name);

  private readonly sqlSkillPath = path.join(
    __dirname,
    '..',
    '..',
    'skills',
    '03-comparable-sales-sql.md',
  );

  constructor(
    private readonly comparableSalesRepository: ComparableSalesRepository,
    private readonly anthropicService: AnthropicService,
  ) {}

  async search(dto: ComparableSalesQueryDto): Promise<ComparableSalesResponse> {
    const correctionsApplied: string[] = [];

    let resolvedArea: number | undefined = dto.subjectArea;
    if (resolvedArea === undefined) {
      const lookedUp = await this.comparableSalesRepository.lookupArea(
        dto.locality,
        dto.street,
        dto.houseNumber,
        dto.unitNumber,
      );
      resolvedArea = lookedUp ?? undefined;
    }

    const baseDateThreshold = this.calculateDateThreshold(dto.valuationDate, dto.monthsLookback);

    let params: SearchParams = {
      locality: dto.locality,
      street: dto.street,
      houseNumber: dto.houseNumber,
      isStrata: dto.isStrata,
      dateThreshold: baseDateThreshold,
      subjectArea: resolvedArea,
      limit: dto.limit,
    };

    let data = await this.comparableSalesRepository.search(params);

    // Step 1 — fix street name via LIKE diagnostic
    if (data.length < 3) {
      const corrected = await this.comparableSalesRepository.findStreetName(
        params.locality,
        params.street,
      );
      if (corrected && corrected !== params.street) {
        correctionsApplied.push(`Street name corrected: '${params.street}' → '${corrected}'`);
        params = { ...params, street: corrected };
        data = await this.comparableSalesRepository.search(params);
      }
    }

    // Step 2 — expand to whole street (drop house number)
    if (data.length < 3 && params.houseNumber !== undefined) {
      correctionsApplied.push('House number filter removed — expanded to whole street');
      params = { ...params, houseNumber: undefined };
      data = await this.comparableSalesRepository.search(params);
    }

    // Step 3 — extend date range to 60 months
    if (data.length < 3) {
      const extendedThreshold = this.calculateDateThreshold(dto.valuationDate, 60);
      correctionsApplied.push(`Date range extended to 60 months (was ${dto.monthsLookback})`);
      params = { ...params, dateThreshold: extendedThreshold };
      data = await this.comparableSalesRepository.search(params);
    }

    // Step 4 — add adjacent localities (same postcode)
    if (data.length < 3) {
      const adjacent = await this.comparableSalesRepository.findAdjacentLocalities(dto.locality);
      if (adjacent.length > 0) {
        correctionsApplied.push(`Adjacent localities included: ${adjacent.join(', ')}`);
        params = { ...params, additionalLocalities: adjacent };
        data = await this.comparableSalesRepository.search(params);
      }
    }

    // Step 5 — remove strata/freehold filter
    if (data.length < 3) {
      correctionsApplied.push('Strata/freehold filter removed — mixed tenure search');
      params = { ...params, isStrata: undefined };
      data = await this.comparableSalesRepository.search(params);
    }

    const warnings = this.buildWarnings(data, dto);

    return {
      data,
      meta: {
        locality: dto.locality,
        street: params.street,
        houseNumber: params.houseNumber,
        unitNumber: dto.unitNumber,
        subjectArea: resolvedArea,
        valuationDate: dto.valuationDate,
        isStrata: dto.isStrata,
        monthsLookback: dto.monthsLookback,
        limit: dto.limit,
        totalReturned: data.length,
        correctionsApplied,
        warnings,
      },
    };
  }

  async searchViaClaude(dto: ComparableSalesSqlSearchDto): Promise<ComparableSalesAiQueryResponse> {
    const payload = {
      address: dto.address,
      valuationDate: dto.valuationDate ?? new Date().toISOString().split('T')[0],
      monthsLookback: dto.monthsLookback,
      limit: dto.limit,
    };
    const { sql, params } = await this.anthropicService.generateSql(this.sqlSkillPath, payload);
    this.validateGeneratedSql(sql, params);
    const data = await this.comparableSalesRepository.executeRawSql(sql, params);
    return { data, generatedSql: sql, paramCount: params.length };
  }

  private validateGeneratedSql(sql: string, params: unknown[]): void {
    const upper = sql.trim().toUpperCase();

    if (!upper.startsWith('SELECT')) {
      throw new ComparableSalesSafetyCheckException('generated query must be a SELECT statement');
    }

    if (!upper.includes('PROPERTY_SALES_RAW')) {
      throw new ComparableSalesSafetyCheckException('generated query must target property_sales_raw');
    }

    if (sql.includes(';')) {
      throw new ComparableSalesSafetyCheckException(
        'generated query must not contain multiple statements',
      );
    }

    if (!upper.includes('LIMIT')) {
      throw new ComparableSalesSafetyCheckException('generated query must include a LIMIT clause');
    }

    if (!Array.isArray(params)) {
      throw new ComparableSalesSafetyCheckException('generated params must be an array');
    }

    this.logger.log(`Claude SQL safety check passed — ${params.length} params`);
  }

  private calculateDateThreshold(valuationDate: string, monthsLookback: number): Date {
    const date = new Date(valuationDate);
    date.setMonth(date.getMonth() - monthsLookback);
    return date;
  }

  private buildWarnings(data: ComparableSale[], dto: ComparableSalesQueryDto): string[] {
    const warnings: string[] = [];

    if (data.length === 0) {
      warnings.push('Only 0 results — evidence thin');
      return warnings;
    }

    if (data.every((d) => d.saleCode === null)) {
      warnings.push('sale_code NULL — arms-length unconfirmed');
    }

    if (data.every((d) => d.zoning === null)) {
      warnings.push('Zoning NULL — Planning Portal check required');
    }

    const valuationDate = new Date(dto.valuationDate);
    const hasPostValuation = data.some((d) => {
      if (!d.contractDate) return false;
      return new Date(String(d.contractDate)) > valuationDate;
    });
    if (hasPostValuation) {
      warnings.push('Post-valuation date sales — time adjustment needed');
    }

    if (data.length < 3) {
      warnings.push(`Only ${data.length} result${data.length === 1 ? '' : 's'} — evidence thin`);
    }

    return warnings;
  }
}
