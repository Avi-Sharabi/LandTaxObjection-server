import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateComparableSalesDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Dispute case UUID — generated comparables will be saved against this case' })
  @IsUUID()
  dispute_case_id: string;

  // ── VG values — loaded from valuation_notice if not provided ─────────────

  @ApiProperty({ example: 5760000, required: false, nullable: true, description: 'VG assessed land value for the current year — overrides valuation_notice.assessed_land_value if provided' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  vg_land_value_current?: number;

  @ApiProperty({ example: 4730000, required: false, nullable: true, description: 'VG assessed land value for the prior year — overrides valuation_notice.prior_land_value if provided' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  vg_land_value_prior?: number;

  @ApiProperty({ example: 4000, required: false, nullable: true, description: "VG's area in m² — overrides valuation_notice.land_area_vg_sqm if provided" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  land_area_vg_sqm?: number;

  // ── Property fields — loaded from property if not provided ────────────────

  @ApiProperty({ example: 'Lot 10 / DP 1053060', required: false, nullable: true, description: 'Lot/DP — overrides property.lot_dp if provided' })
  @IsOptional()
  @IsString()
  lot_dp?: string;

  @ApiProperty({ example: '120m x 34m', required: false, nullable: true, description: 'Property dimensions — overrides property.dimensions if provided' })
  @IsOptional()
  @IsString()
  dimensions?: string;

  @ApiProperty({ example: 30.0, required: false, nullable: true, description: 'Height limit in metres — overrides property.height_limit_m if provided' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  height_limit_m?: number;

  @ApiProperty({ example: '3049329', required: false, nullable: true, description: 'Property ID — overrides property.pid if provided' })
  @IsOptional()
  @IsString()
  pid?: string;

  @ApiProperty({ example: 4022, required: false, nullable: true, description: 'Actual land area in m² — last-resort fallback used only when the property has no persisted land_area_eplanning_sqm or land_area_sqm on file' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  land_area_sqm?: number;

  @ApiProperty({ example: 4022, required: false, nullable: true, description: 'ePlanning/cadastre lot area in m² — last-resort fallback used only when no persisted property land area and no other override is available' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  land_area_eplanning_sqm?: number;

  @ApiProperty({ example: 'E5 Heavy Industrial', required: false, nullable: true, description: 'Zoning — overrides property.zoning if provided' })
  @IsOptional()
  @IsString()
  zoning?: string;

  @ApiProperty({ example: 'PRESTONS', required: false, nullable: true, description: 'Suburb — overrides property.suburb if provided' })
  @IsOptional()
  @IsString()
  suburb?: string;

  @ApiProperty({ example: '2170', required: false, nullable: true, description: 'Postcode — overrides property.postcode if provided' })
  @IsOptional()
  @IsString()
  postcode?: string;

  @ApiProperty({ example: -33.9173, required: false, nullable: true, description: 'Subject property latitude — used to gate comparable sales by real distance; falls back to a suburb-centroid lookup if omitted' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiProperty({ example: 151.2313, required: false, nullable: true, description: 'Subject property longitude — used to gate comparable sales by real distance; falls back to a suburb-centroid lookup if omitted' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  // ── Valuation date — loaded from valuation_notice if not provided ─────────

  @ApiProperty({ example: '2025-07-01', required: false, nullable: true, description: 'Valuation date (YYYY-MM-DD) — overrides valuation_notice.valuation_date if provided' })
  @IsOptional()
  @IsDateString()
  valuation_date?: string;
}
