import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum OwnershipType {
  INDIVIDUAL = 'individual',
  COMPANY_TRUST = 'company_trust',
}

export class ComputeLandTaxDto {
  @ApiProperty({
    description: 'NSW tax year (e.g. 2026). Valuation date = 1 July of (tax_year - 1).',
    example: 2026,
    minimum: 2020,
    maximum: 2040,
  })
  @IsInt()
  @Min(2020)
  @Max(2040)
  tax_year: number;

  @ApiProperty({
    description: 'The new disputed/appraised land value being argued to the VG (AUD).',
    example: 2500000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  disputed_land_value: number;

  @ApiPropertyOptional({
    description:
      'VG assessed land value from the notice (AUD). Required when vg_year_values is not provided.',
    example: 3500000,
    minimum: 0,
  })
  @ValidateIf((o) => !o.vg_year_values || o.vg_year_values.length !== 3)
  @IsNotEmpty({ message: 'vg_assessed_value is required when vg_year_values is not provided' })
  @IsNumber()
  @Min(0)
  vg_assessed_value?: number;

  @ApiPropertyOptional({
    description:
      'Three consecutive annual land values used by Revenue NSW to compute the 3-year average ' +
      '(e.g. [1150000, 1100000, 1050000] for 2022–2024). ' +
      'When provided, overrides vg_assessed_value for tax comparison purposes.',
    type: [Number],
    example: [1150000, 1100000, 1050000],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Type(() => Number)
  vg_year_values?: number[];

  @ApiPropertyOptional({
    description:
      'Additional land values for aggregation — other taxable properties owned by the same owner (AUD). ' +
      'The threshold is shared across the combined total.',
    type: [Number],
    example: [800000],
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Type(() => Number)
  additional_land_values?: number[];

  @ApiPropertyOptional({
    description: 'YML success fee share % applied to tax savings. Defaults to 20.',
    example: 20,
    default: 20,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  yml_fee_share_pct?: number;

  @ApiPropertyOptional({
    description:
      'Ownership type of the property. Company/trust ownership removes the tax-free threshold — ' +
      '1.6% applies to the full land value from $1. Defaults to "individual".',
    enum: OwnershipType,
    default: OwnershipType.INDIVIDUAL,
  })
  @IsOptional()
  @IsEnum(OwnershipType)
  ownership_type?: OwnershipType;

  @ApiPropertyOptional({
    description:
      'Whether the owner is a foreign person or foreign company. ' +
      'Adds a 4% surcharge on the taxable base (above threshold for individuals; full value for companies/trusts).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  is_foreign?: boolean;
}
