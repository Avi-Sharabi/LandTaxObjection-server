import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class ComparableBreakdownDto {
  @Expose()
  @ApiProperty({ description: 'Comparable sale UUID' })
  comparable_id: string;

  @Expose()
  @ApiProperty({ description: 'Street address of the comparable property', example: '25 Smith St, Surry Hills' })
  address: string;

  @Expose()
  @ApiProperty({ description: 'Sale price of the comparable ($)', example: 1200000 })
  sale_price: number;

  @Expose()
  @ApiProperty({ description: 'Land area of the comparable (m²)', example: 500 })
  land_area_sqm: number;

  @Expose()
  @ApiProperty({ description: 'Contract date of the comparable sale', example: '2024-03-01' })
  sale_date: string;

  @Expose()
  @ApiProperty({ description: 'Step 2 — Raw rate: sale_price ÷ land_area ($/m²)', example: 2400.0 })
  raw_rate_per_sqm: number;

  @Expose()
  @ApiProperty({ description: 'Months between sale_date and valuation date (1 July of tax_year−1)', example: 4 })
  months_to_valuation: number;

  @Expose()
  @ApiProperty({ description: 'Step 3 — Time-adjusted rate: raw_rate × (1 + market_index_pct)^n ($/m²)', example: 2429.02 })
  adjusted_rate_per_sqm: number;

  @Expose()
  @ApiProperty({ description: 'Weight applied in Step 4 reconciliation (0–1)', example: 0.4 })
  weight: number;
}

@Exclude()
export class LandTaxResponseDto {
  @Expose()
  @ApiProperty({ description: 'NSW tax year', example: 2025 })
  tax_year: number;

  @Expose()
  @ApiProperty({ description: 'Valuation date used (1 July of tax_year − 1)', example: '2024-07-01' })
  valuation_date: string;

  @Expose()
  @ApiProperty({ description: 'Per-comparable breakdown of Steps 2 & 3', type: [ComparableBreakdownDto] })
  @Type(() => ComparableBreakdownDto)
  comparables: ComparableBreakdownDto[];

  @Expose()
  @ApiProperty({ description: 'Step 4 — Reconciled rate: weighted sum of adjusted rates ($/m²)', example: 2350.5 })
  reconciled_rate_per_sqm: number;

  @Expose()
  @ApiProperty({ description: 'Subject property land area (m²)', example: 450 })
  subject_land_area_sqm: number;

  @Expose()
  @ApiProperty({ description: 'Step 5 — Unimproved Land Value (ULV): reconciled_rate × subject_land_area ($)', example: 1057725 })
  land_value: number;

  @Expose()
  @ApiProperty({ description: 'NSW land tax-free threshold for the tax year ($)', example: 1187000 })
  threshold: number;

  @Expose()
  @ApiProperty({ description: 'Step 6 — Taxable value: max(0, total_land_value − threshold) ($)', example: 0 })
  taxable_value: number;

  @Expose()
  @ApiProperty({ description: 'Fixed base amount for land tax calculation ($)', example: 100 })
  base_amount: number;

  @Expose()
  @ApiProperty({ description: 'Marginal rate applied to taxable value (%)', example: 1.6 })
  marginal_rate_pct: number;

  @Expose()
  @ApiProperty({ description: 'Step 7 — Land tax payable: base_amount + taxable_value × marginal_rate ($)', example: 0 })
  land_tax_payable: number;

  @Expose()
  @ApiProperty({ description: 'Whether Step 8 aggregation was applied (additional_land_values were provided)', example: false })
  is_aggregated: boolean;

  @Expose()
  @ApiProperty({ description: 'Step 8 — Total land value used for threshold calculation (sum of all properties, $)', example: 1057725 })
  total_land_value: number;

  // ── Client Savings & YML Profit Analysis ─────────────────────────────────

  @Expose()
  @ApiProperty({ description: 'YML success fee share % applied', example: 20 })
  yml_fee: number;

  @Expose()
  @ApiProperty({ description: 'YML revenue: tax_saved × yml_fee / 100 ($)', example: 3200 })
  yml_revenue: number;

  @Expose()
  @ApiProperty({ description: 'Client net saving: tax_saved − yml_revenue ($)', example: 12800 })
  client_savings: number;
}
