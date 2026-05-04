import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

@ValidatorConstraint({ name: 'weightsSumToOne', async: false })
export class WeightsSumValidator implements ValidatorConstraintInterface {
  validate(weights: number[]): boolean {
    if (!Array.isArray(weights)) return false;
    const sum = weights.reduce((acc, w) => acc + w, 0);
    return Math.abs(sum - 1.0) <= 0.001;
  }

  defaultMessage(): string {
    return 'weights must sum to 1.0 (tolerance ±0.001)';
  }
}

export class ComputeLandTaxDto {
  @ApiProperty({ description: 'UUID of the dispute case', example: 'uuid-here' })
  @IsUUID()
  dispute_case_id: string;

  @ApiProperty({
    description: 'Exactly 3 comparable sale UUIDs belonging to the dispute case',
    type: [String],
    example: ['uuid1', 'uuid2', 'uuid3'],
  })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  comparable_ids: string[];

  @ApiProperty({
    description: 'Reconciliation weights for each comparable (must sum to 1.0, in the same order as comparable_ids)',
    type: [Number],
    example: [0.4, 0.35, 0.25],
  })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Max(1, { each: true })
  @Validate(WeightsSumValidator)
  @Type(() => Number)
  weights: number[];

  @ApiProperty({
    description: 'Monthly market index percentage used for time-adjustment (e.g. 0.3 = 0.3% per month). Range: −50 to 50.',
    example: 0.3,
    minimum: -50,
    maximum: 50,
  })
  @IsNumber()
  @Min(-50)
  @Max(50)
  market_index_pct: number;

  @ApiProperty({
    description: 'NSW tax year (e.g. 2025). Valuation date = 1 July of (tax_year - 1).',
    example: 2025,
    minimum: 2020,
    maximum: 2040,
  })
  @IsInt()
  @Min(2020)
  @Max(2040)
  tax_year: number;

  @ApiPropertyOptional({
    description: 'Additional land values for aggregation (Step 8) — other properties owned by the same owner (AUD)',
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

}
