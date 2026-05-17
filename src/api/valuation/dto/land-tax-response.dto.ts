import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class LandTaxResponseDto {
  @Expose()
  @ApiProperty({ description: 'NSW tax year', example: 2026 })
  tax_year: number;

  @Expose()
  @ApiProperty({ description: 'NSW land tax-free threshold for the tax year ($)', example: 1075000 })
  threshold: number;

  @Expose()
  @ApiProperty({ description: 'VG 3-year average land value used for tax comparison ($). Computed from vg_year_values when supplied, otherwise equals vg_assessed_value.', example: 3500000 })
  vg_average_land_value: number;

  @Expose()
  @ApiProperty({ description: 'The disputed/appraised land value being argued to the VG ($)', example: 2500000 })
  disputed_land_value: number;

  @Expose()
  @ApiProperty({ description: 'Whether aggregation was applied (additional_land_values were provided)', example: false })
  is_aggregated: boolean;

  @Expose()
  @ApiProperty({ description: 'Ownership type: individual or company_trust', example: 'individual' })
  ownership_type: string;

  @Expose()
  @ApiProperty({ description: 'Whether the owner is a foreign person/company (4% surcharge applies)', example: false })
  is_foreign: boolean;

  @Expose()
  @ApiProperty({ description: 'Total land value used for threshold calculation: disputed_land_value + additional_land_values ($)', example: 2500000 })
  total_land_value: number;

  @Expose()
  @ApiProperty({ description: 'Taxable value: max(0, total_land_value − threshold) ($)', example: 1425000 })
  taxable_value: number;

  @Expose()
  @ApiProperty({ description: 'Fixed base charge for land tax ($)', example: 100 })
  base_amount: number;

  @Expose()
  @ApiProperty({ description: 'Marginal rate applied to the taxable value (%)', example: 1.6 })
  marginal_rate_pct: number;

  @Expose()
  @ApiProperty({ description: 'Land tax payable on the disputed value: base_amount + taxable_value × marginal_rate ($)', example: 22900 })
  land_tax_payable: number;

  @Expose()
  @ApiProperty({ description: 'Foreign surcharge rate applied (%). Null when is_foreign is false.', example: 4, nullable: true })
  foreign_surcharge_pct: number | null;

  @Expose()
  @ApiProperty({ description: 'Annual foreign surcharge on disputed value (0 if not foreign) ($)', example: 0 })
  foreign_surcharge: number;

  @Expose()
  @ApiProperty({ description: 'Total tax payable on disputed value including foreign surcharge ($)', example: 22900 })
  total_tax_payable: number;

  @Expose()
  @ApiProperty({ description: 'Standard land tax at VG value before dispute ($)', example: 38900 })
  vg_land_tax: number;

  @Expose()
  @ApiProperty({ description: 'Foreign surcharge at VG value (0 if not foreign) ($)', example: 0 })
  vg_foreign_surcharge: number;

  @Expose()
  @ApiProperty({ description: 'Total tax at VG value including foreign surcharge ($)', example: 38900 })
  vg_total_tax: number;

  @Expose()
  @ApiProperty({ description: 'Annual tax saved (total tax): vg_total_tax − total_tax_payable. Always ≥ 0 ($)', example: 16000 })
  tax_saved: number;

  // ── Client Savings & YML Profit Analysis ─────────────────────────────────

  @Expose()
  @ApiProperty({ description: 'YML success fee share % applied', example: 20 })
  yml_fee_share_pct: number;

  @Expose()
  @ApiProperty({ description: 'YML revenue: tax_saved × yml_fee / 100 ($)', example: 3200 })
  yml_revenue: number;

  @Expose()
  @ApiProperty({ description: 'Client net saving per year: tax_saved − yml_revenue ($)', example: 12800 })
  client_savings: number;

  @Expose()
  @ApiProperty({ description: '3-year cumulative tax saving: tax_saved × 3 (VG valuation typically holds 3 years) ($)', example: 48000 })
  tax_saved_3yr: number;

  @Expose()
  @ApiProperty({ description: '3-year cumulative client net saving after YML fee ($)', example: 38400 })
  client_savings_3yr: number;
}
