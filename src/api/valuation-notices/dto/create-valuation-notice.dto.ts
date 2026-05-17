import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { OwnershipType } from '../../../common/enums/ownership-type.enum';

export class CreateValuationNoticeDto {
  @ApiProperty({ description: 'UUID of the property this notice belongs to' })
  @IsUUID()
  property_id: string;

  @ApiProperty({ description: 'Valuation date (ISO 8601)', example: '2025-07-01' })
  @IsDateString()
  valuation_date: string;

  @ApiPropertyOptional({ description: 'Current year VG assessed land value (T) — AUD', example: 20800000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  assessed_land_value?: number;

  @ApiPropertyOptional({ description: 'Prior year VG land value (T-1) — AUD', example: 18300000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  prior_land_value?: number;

  @ApiPropertyOptional({ description: 'Land value two years prior (T-2) — AUD', example: 19300000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  land_value_2yr_prior?: number;

  @ApiPropertyOptional({ enum: OwnershipType, description: 'Ownership type — affects threshold eligibility' })
  @IsOptional()
  @IsEnum(OwnershipType)
  ownership_type?: OwnershipType;

  @ApiPropertyOptional({ description: 'Whether the owner is a foreign person or company (4% surcharge applies)', default: false })
  @IsOptional()
  @IsBoolean()
  is_foreign?: boolean;

  @ApiPropertyOptional({ description: 'Whether this property is exempt from land tax (e.g. PPR)', default: false })
  @IsOptional()
  @IsBoolean()
  is_exempt?: boolean;

}
