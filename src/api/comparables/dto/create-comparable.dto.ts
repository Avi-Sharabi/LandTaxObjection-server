import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateComparableDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Dispute case UUID' })
  @IsUUID()
  dispute_case_id: string;

  @ApiProperty({ example: '12 Main Street, Melbourne VIC 3000' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({
    example: '2024-06-15',
    description: 'Sale date — must not be in the future (YYYY-MM-DD)',
  })
  @IsDateString()
  sale_date: string;

  @ApiProperty({ example: 850000.0, description: 'Sale price in AUD' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  sale_price: number;

  @ApiProperty({ example: 250000.0, description: 'Estimated value of improvements (buildings, structures) in AUD' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  estimated_improvements_value: number;

  @ApiProperty({ example: 612.5, required: false, description: 'Land area in square metres' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  land_area_sqm?: number;

  @ApiProperty({ required: false, example: 'Corner block, similar zoning' })
  @IsOptional()
  @IsString()
  notes?: string;
}
