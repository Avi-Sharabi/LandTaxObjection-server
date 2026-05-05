import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ComputeLandTaxDto } from './dto/compute-land-tax.dto';
import { LandTaxResponseDto } from './dto/land-tax-response.dto';
import { NSW_LAND_TAX_RATES, NswLandTaxRates } from './constants/land-tax-rates.constants';

const DEFAULT_FEE_SHARE_PCT = 20;

@Injectable()
export class LandTaxComputationService {
  computeLandTax(dto: ComputeLandTaxDto): LandTaxResponseDto {
    const rates = NSW_LAND_TAX_RATES[dto.tax_year];
    if (!rates) {
      throw new BadRequestException(
        `NSW land tax rates for tax year ${dto.tax_year} are not configured. Supported years: ${Object.keys(NSW_LAND_TAX_RATES).join(', ')}`,
      );
    }

    // Resolve VG assessed value: 3-year average takes precedence over direct value
    let vgAssessedValue: number;
    if (dto.vg_year_values?.length === 3) {
      vgAssessedValue = dto.vg_year_values.reduce((sum, v) => sum + v, 0) / 3;
    } else if (dto.vg_assessed_value != null) {
      vgAssessedValue = dto.vg_assessed_value;
    } else {
      throw new BadRequestException(
        'Either vg_assessed_value or vg_year_values (3 values) must be provided.',
      );
    }

    const disputedValue = dto.disputed_land_value;

    // Aggregation: threshold is shared across all taxable properties combined
    const isAggregated = !!(dto.additional_land_values?.length);
    const additional = dto.additional_land_values?.reduce((sum, v) => sum + v, 0) ?? 0;
    const totalLandValue = disputedValue + additional;

    // Tax on disputed value
    const taxableValue = Math.max(0, totalLandValue - rates.threshold);
    const landTaxPayable = this.calcTax(totalLandValue, rates);
    const { baseAmount, marginalRatePct } = this.taxRateBand(totalLandValue, rates);

    // Client Savings & YML Profit Analysis
    // Include additional land values on both sides so threshold-band effects
    // (e.g. crossing the premium threshold) are correctly reflected in the saving.
    const feeSharePct = dto.yml_fee_share_pct ?? DEFAULT_FEE_SHARE_PCT;
    const vgTotal = vgAssessedValue + additional;
    const vgLandTax = this.calcTax(vgTotal, rates);
    const taxSaved = Math.max(0, vgLandTax - this.calcTax(totalLandValue, rates));
    const ymlRevenue = round2(taxSaved * feeSharePct / 100);
    const clientSavings = round2(taxSaved - ymlRevenue);
    // 3-year cumulative (VG valuation typically holds 3 years)
    const taxSaved3yr = round2(taxSaved * 3);
    const clientSavings3yr = round2(clientSavings * 3);

    return plainToInstance(
      LandTaxResponseDto,
      {
        tax_year: dto.tax_year,
        threshold: rates.threshold,
        vg_average_land_value: round2(vgAssessedValue),
        vg_land_tax: round2(vgLandTax),
        disputed_land_value: round2(disputedValue),
        is_aggregated: isAggregated,
        total_land_value: round2(totalLandValue),
        taxable_value: round2(taxableValue),
        base_amount: baseAmount,
        marginal_rate_pct: marginalRatePct,
        land_tax_payable: round2(landTaxPayable),
        tax_saved: round2(taxSaved),
        yml_fee: feeSharePct,
        yml_revenue: ymlRevenue,
        client_savings: clientSavings,
        tax_saved_3yr: taxSaved3yr,
        client_savings_3yr: clientSavings3yr,
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
