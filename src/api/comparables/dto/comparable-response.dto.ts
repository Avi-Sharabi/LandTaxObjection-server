import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class ComparableResponseDto {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() dispute_case_id: string;
  @Expose() @ApiProperty() created_by_id: string;
  @Expose() @ApiProperty() created_at: Date;

  @Expose() @ApiProperty({ nullable: true }) sale_id: string | null;
  @Expose() @ApiProperty({ nullable: true }) source_file: string | null;
  @Expose() @ApiProperty({ nullable: true }) imported_at: Date | null;
  @Expose() @ApiProperty({ nullable: true }) district_code: string | null;
  @Expose() @ApiProperty({ nullable: true }) property_id: string | null;
  @Expose() @ApiProperty({ nullable: true }) sale_counter: number | null;
  @Expose() @ApiProperty({ nullable: true }) download_datetime: Date | null;
  @Expose() @ApiProperty({ nullable: true }) property_name: string | null;
  @Expose() @ApiProperty({ nullable: true }) property_unit_number: string | null;
  @Expose() @ApiProperty({ nullable: true }) property_house_number: string | null;
  @Expose() @ApiProperty({ nullable: true }) property_street_name: string | null;
  @Expose() @ApiProperty({ nullable: true }) property_locality: string | null;
  @Expose() @ApiProperty({ nullable: true }) property_post_code: string | null;
  @Expose() @ApiProperty({ nullable: true }) area: number | null;
  @Expose() @ApiProperty({ nullable: true }) contract_date: Date | null;
  @Expose() @ApiProperty({ nullable: true }) settlement_date: Date | null;
  @Expose() @ApiProperty({ nullable: true }) purchase_price: number | null;
  @Expose() @ApiProperty({ nullable: true }) zoning: string | null;
  @Expose() @ApiProperty({ nullable: true }) nature_of_property: string | null;
  @Expose() @ApiProperty({ nullable: true }) primary_purpose: string | null;
  @Expose() @ApiProperty({ nullable: true }) strata_lot_number: string | null;
  @Expose() @ApiProperty({ nullable: true }) component_code: string | null;
  @Expose() @ApiProperty({ nullable: true }) sale_code: string | null;
  @Expose() @ApiProperty({ nullable: true }) interest_of_sale_percent: number | null;
  @Expose() @ApiProperty({ nullable: true }) dealing_number: string | null;
  @Expose() @ApiProperty({ nullable: true }) owner_type: string | null;
  @Expose() @ApiProperty({ nullable: true }) adjusted_rate_per_sqm: number | null;
  @Expose() @ApiProperty({ nullable: true, description: "This comparable's own land value in dollars after improvement stripping and adjustments: adjusted_rate_per_sqm × comparable area" }) adjusted_land_value: number | null;
  @Expose() @ApiProperty({ nullable: true, description: "This comparable's own land value adjusted for time only (no size adjustment) — the figure to enter for this comparable in the NSW valuation objection portal" }) suggested_land_value: number | null;
  @Expose() @ApiProperty({ nullable: true }) explanation: string | null;
  @Expose() @ApiProperty({ nullable: true, enum: ['exact', 'estimated'], description: "'exact' for vacant land (no improvement deduction needed); 'estimated' for improved sales using the flat 50% improvement-deduction estimate" }) improvement_confidence: 'exact' | 'estimated' | null;
  @Expose() @ApiProperty({ nullable: true, enum: ['preferred', 'widened', 'extrapolated'], description: "How this comparable cleared the size-band gate — 'extrapolated' means it's a ranked-last-resort pick outside the standard/widened size tolerance" }) size_tier: 'preferred' | 'widened' | 'extrapolated' | null;
  @Expose() @ApiProperty({ nullable: true, description: 'Structured caution for UI display (e.g. a badge/alert) — only set for a ranked-last-resort comparable; distinct from the free-text explanation field' }) warning: string | null;
}
