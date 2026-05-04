import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { ComparableSale } from '../comparables/entities/comparable-sale.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { ComputeLandTaxDto } from './dto/compute-land-tax.dto';
import { ComparableBreakdownDto, LandTaxResponseDto } from './dto/land-tax-response.dto';
import { NSW_LAND_TAX_RATES, NswLandTaxRates } from './constants/land-tax-rates.constants';

const DEFAULT_FEE_SHARE_PCT = 20;

@Injectable()
export class LandTaxComputationService {
  constructor(
    @InjectRepository(ComparableSale)
    private readonly comparableRepo: Repository<ComparableSale>,
    @InjectRepository(DisputeCase)
    private readonly disputeCaseRepo: Repository<DisputeCase>,
  ) {}

  async computeLandTax(dto: ComputeLandTaxDto): Promise<LandTaxResponseDto> {
    const rates = NSW_LAND_TAX_RATES[dto.tax_year];
    if (!rates) {
      throw new BadRequestException(
        `NSW land tax rates for tax year ${dto.tax_year} are not configured. Supported years: ${Object.keys(NSW_LAND_TAX_RATES).join(', ')}`,
      );
    }

    const disputeCase = await this.disputeCaseRepo.findOne({
      where: { id: dto.dispute_case_id },
      relations: ['property', 'valuation_notice'],
    });
    if (!disputeCase) {
      throw new NotFoundException(`Dispute case '${dto.dispute_case_id}' not found`);
    }
    if (!disputeCase.property) {
      throw new NotFoundException(`Property not found for dispute case '${dto.dispute_case_id}'`);
    }
    if (!disputeCase.valuation_notice) {
      throw new NotFoundException(`Valuation notice not found for dispute case '${dto.dispute_case_id}'`);
    }

    const comparables = await this.comparableRepo.find({
      where: {
        id: In(dto.comparable_ids),
        dispute_case_id: dto.dispute_case_id,
      },
    });
    if (comparables.length !== 3) {
      const foundIds = comparables.map((c) => c.id);
      const missingIds = dto.comparable_ids.filter((id) => !foundIds.includes(id));
      throw new NotFoundException(
        `Comparable sale(s) not found or do not belong to this dispute case: ${missingIds.join(', ')}`,
      );
    }

    const subjectLandAreaSqm = Number(disputeCase.property.land_area_sqm);
    // 1 July of (tax_year − 1), month index 6 = July
    const valuationDate = new Date(dto.tax_year - 1, 6, 1);

    // Steps 2 & 3 per comparable
    const comparableBreakdowns: ComparableBreakdownDto[] = dto.comparable_ids.map((id, idx) => {
      const comp = comparables.find((c) => c.id === id)!;
      const weight = dto.weights[idx];

      const salePrice = Number(comp.purchase_price ?? 0);
      const landAreaSqm = Number(comp.area ?? 0);

      // Step 2: Raw Rate
      const rawRatePerSqm = landAreaSqm > 0 ? salePrice / landAreaSqm : 0;

      // Step 3: months between sale date and valuation date
      if (!comp.contract_date) {
        throw new BadRequestException(`Comparable '${comp.id}' has no contract_date and cannot be time-adjusted`);
      }
      const saleDate = new Date(comp.contract_date);
      const monthsToValuation = Math.max(0, monthDiff(saleDate, valuationDate));
      const adjustedRatePerSqm =
        rawRatePerSqm * Math.pow(1 + dto.market_index_pct / 100, monthsToValuation);

      const addressParts = [
        comp.property_house_number,
        comp.property_street_name,
        comp.property_locality,
      ].filter(Boolean);
      const address = addressParts.length > 0 ? addressParts.join(' ') : 'Unknown';

      return plainToInstance(
        ComparableBreakdownDto,
        {
          comparable_id: comp.id,
          address,
          sale_price: round2(salePrice),
          land_area_sqm: round2(landAreaSqm),
          sale_date: saleDate.toISOString().split('T')[0],
          raw_rate_per_sqm: round2(rawRatePerSqm),
          months_to_valuation: monthsToValuation,
          adjusted_rate_per_sqm: round2(adjustedRatePerSqm),
          weight,
        },
        { excludeExtraneousValues: true },
      );
    });

    // Step 4: Reconciled Rate
    const reconciledRatePerSqm = comparableBreakdowns.reduce(
      (sum, c) => sum + c.weight * c.adjusted_rate_per_sqm,
      0,
    );

    // Step 5: Land Value (ULV) — the new disputed value
    const landValue = reconciledRatePerSqm * subjectLandAreaSqm;

    // Step 8: Aggregation (if additional land values provided)
    const isAggregated = !!(dto.additional_land_values && dto.additional_land_values.length > 0);
    const totalLandValue = isAggregated
      ? landValue + dto.additional_land_values!.reduce((sum, lv) => sum + lv, 0)
      : landValue;

    // Step 6: Taxable Value
    const taxableValue = Math.max(0, totalLandValue - rates.threshold);

    // Step 7: Land Tax Payable — tiered rate on aggregated total
    const landTaxPayable = this.calcTax(totalLandValue, rates);
    const { baseAmount, marginalRatePct } = this.taxRateBand(totalLandValue, rates);

    // ── Client Savings & YML Profit Analysis ─────────────────────────────────
    const vgAssessedValue = Number(disputeCase.valuation_notice.assessed_land_value);
    const feeSharePct = dto.yml_fee_share_pct ?? DEFAULT_FEE_SHARE_PCT;

    const taxSaved = Math.max(0, this.calcTax(vgAssessedValue, rates) - this.calcTax(landValue, rates));
    const ymlRevenue = round2(taxSaved * feeSharePct / 100);
    const clientSavings = round2(taxSaved - ymlRevenue);

    return plainToInstance(
      LandTaxResponseDto,
      {
        tax_year: dto.tax_year,
        valuation_date: valuationDate.toISOString().split('T')[0],
        comparables: comparableBreakdowns,
        reconciled_rate_per_sqm: round2(reconciledRatePerSqm),
        subject_land_area_sqm: round2(subjectLandAreaSqm),
        land_value: round2(landValue),
        threshold: rates.threshold,
        taxable_value: round2(taxableValue),
        base_amount: baseAmount,
        marginal_rate_pct: marginalRatePct,
        land_tax_payable: round2(landTaxPayable),
        is_aggregated: isAggregated,
        total_land_value: round2(totalLandValue),
        // Savings & profit
        yml_fee: feeSharePct,
        yml_revenue: ymlRevenue,
        client_savings: clientSavings,
      },
      { excludeExtraneousValues: true },
    );
  }

  private calcTax(landValue: number, rates: NswLandTaxRates): number {
    if (landValue <= rates.threshold) return 0;
    if (landValue > rates.premiumThreshold) {
      return (
        rates.premiumBaseAmount +
        ((landValue - rates.premiumThreshold) * rates.premiumRatePct) / 100
      );
    }
    return rates.baseAmount + ((landValue - rates.threshold) * rates.marginalRatePct) / 100;
  }

  private taxRateBand(
    landValue: number,
    rates: NswLandTaxRates,
  ): { baseAmount: number; marginalRatePct: number } {
    if (landValue <= rates.threshold) return { baseAmount: 0, marginalRatePct: 0 };
    if (landValue > rates.premiumThreshold) {
      return { baseAmount: rates.premiumBaseAmount, marginalRatePct: rates.premiumRatePct };
    }
    return { baseAmount: rates.baseAmount, marginalRatePct: rates.marginalRatePct };
  }
}

function monthDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
