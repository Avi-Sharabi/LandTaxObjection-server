import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { CalculateTaxDto, OwnershipType } from './dto/calculate-tax.dto';
import { LandTaxResponseDto } from './dto/land-tax-response.dto';
import { LandTaxRate } from './entities/land-tax-rate.entity';

@Injectable()
export class LandTaxComputationService {
  constructor(
    @InjectRepository(LandTaxRate)
    private readonly landTaxRateRepo: Repository<LandTaxRate>,
  ) {}

  async computeLandTax(dto: CalculateTaxDto): Promise<LandTaxResponseDto> {
    const rates = await this.landTaxRateRepo.findOne({ where: { tax_year: dto.tax_year } });
    if (!rates) {
      throw new BadRequestException(
        `No land tax rates configured for tax year ${dto.tax_year}.`,
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
    const ownershipType = dto.ownership_type ?? OwnershipType.INDIVIDUAL;
    const isForeign = dto.is_foreign ?? false;

    // Aggregation: threshold is shared across all taxable properties combined
    const isAggregated = !!(dto.additional_land_values?.length);
    const additional = dto.additional_land_values?.reduce((sum, v) => sum + v, 0) ?? 0;
    const totalLandValue = disputedValue + additional;

    const effectiveThreshold = ownershipType === OwnershipType.COMPANY_TRUST ? 0 : rates.threshold;
    const taxableValue = Math.max(0, totalLandValue - effectiveThreshold);
    const landTaxPayable = this.calcTax(totalLandValue, rates, ownershipType);
    const foreignSurcharge = isForeign
      ? round2(this.calcSurcharge(totalLandValue, rates, ownershipType, rates.foreign_surcharge_pct))
      : 0;
    const totalTaxPayable = round2(landTaxPayable + foreignSurcharge);
    const { baseAmount, marginalRatePct } = this.taxRateBand(totalLandValue, rates, ownershipType);

    const feeSharePct = dto.yml_fee_share_pct ?? 20;
    const vgTotal = vgAssessedValue + additional;
    const vgLandTax = this.calcTax(vgTotal, rates, ownershipType);
    const vgForeignSurcharge = isForeign
      ? round2(this.calcSurcharge(vgTotal, rates, ownershipType, rates.foreign_surcharge_pct))
      : 0;
    const vgTotalTax = round2(vgLandTax + vgForeignSurcharge);

    const taxSaved = Math.max(0, vgTotalTax - totalTaxPayable);
    const ymlRevenue = round2(taxSaved * feeSharePct / 100);
    const clientSavings = round2(taxSaved - ymlRevenue);
    const taxSaved3yr = round2(taxSaved * 3);
    const clientSavings3yr = round2(clientSavings * 3);

    return plainToInstance(
      LandTaxResponseDto,
      {
        tax_year: dto.tax_year,
        threshold: effectiveThreshold,
        vg_average_land_value: round2(vgAssessedValue),
        vg_land_tax: round2(vgLandTax),
        vg_foreign_surcharge: vgForeignSurcharge,
        vg_total_tax: vgTotalTax,
        disputed_land_value: round2(disputedValue),
        is_aggregated: isAggregated,
        ownership_type: ownershipType,
        is_foreign: isForeign,
        total_land_value: round2(totalLandValue),
        taxable_value: round2(taxableValue),
        base_amount: baseAmount,
        marginal_rate_pct: marginalRatePct,
        land_tax_payable: round2(landTaxPayable),
        foreign_surcharge_pct: isForeign ? rates.foreign_surcharge_pct : null,
        foreign_surcharge: foreignSurcharge,
        total_tax_payable: totalTaxPayable,
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

  private calcTax(landValue: number, rates: LandTaxRate, ownershipType: OwnershipType): number {
    const threshold = ownershipType === OwnershipType.COMPANY_TRUST ? 0 : rates.threshold;
    if (landValue <= threshold) return 0;
    if (landValue > rates.premium_threshold) {
      const premiumBase = ownershipType === OwnershipType.COMPANY_TRUST
        ? rates.base_amount + (rates.premium_threshold * rates.marginal_rate_pct) / 100
        : rates.premium_base_amount;
      return premiumBase + ((landValue - rates.premium_threshold) * rates.premium_rate_pct) / 100;
    }
    return rates.base_amount + ((landValue - threshold) * rates.marginal_rate_pct) / 100;
  }

  private calcSurcharge(
    landValue: number,
    rates: LandTaxRate,
    ownershipType: OwnershipType,
    foreignSurchargePct: number,
  ): number {
    const threshold = ownershipType === OwnershipType.COMPANY_TRUST ? 0 : rates.threshold;
    const surchargeBase = Math.max(0, landValue - threshold);
    return (surchargeBase * foreignSurchargePct) / 100;
  }

  private taxRateBand(
    landValue: number,
    rates: LandTaxRate,
    ownershipType: OwnershipType,
  ): { baseAmount: number; marginalRatePct: number } {
    const threshold = ownershipType === OwnershipType.COMPANY_TRUST ? 0 : rates.threshold;
    if (landValue <= threshold) return { baseAmount: 0, marginalRatePct: 0 };
    if (landValue > rates.premium_threshold) {
      const displayBase = ownershipType === OwnershipType.COMPANY_TRUST
        ? rates.base_amount + (rates.premium_threshold * rates.marginal_rate_pct) / 100
        : rates.premium_base_amount;
      return { baseAmount: displayBase, marginalRatePct: rates.premium_rate_pct };
    }
    return { baseAmount: rates.base_amount, marginalRatePct: rates.marginal_rate_pct };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
