import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ComparableSalesSqlSearchDto {
  @ApiProperty({
    example: '8 JAPONICA RD EPPING',
    description: 'Full property address — Claude parses unit, house number, street, and locality',
  })
  @IsString()
  @MaxLength(300)
  address: string;

  @ApiPropertyOptional({
    example: '2024-07-01',
    description: 'Valuation date (YYYY-MM-DD). Defaults to today if omitted.',
  })
  @IsOptional()
  @IsDateString()
  valuationDate?: string;

  @ApiPropertyOptional({ default: 36, minimum: 1, maximum: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  monthsLookback: number = 36;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}

export class ComparableSalesQueryDto {
  @ApiProperty({ example: 'CHATSWOOD', description: 'Property locality (ALL CAPS)' })
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value.toUpperCase().trim())
  locality: string;

  @ApiProperty({ example: 'VICTORIA AVE', description: 'Street name (ALL CAPS)' })
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: string }) => value.toUpperCase().trim())
  street: string;

  @ApiPropertyOptional({ example: '438', description: 'House number (stored as string)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }: { value: string }) => value.toUpperCase().trim())
  houseNumber?: string;

  @ApiPropertyOptional({ example: '5', description: 'Unit/strata lot number' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }: { value: string }) => value.toUpperCase().trim())
  unitNumber?: string;

  @ApiPropertyOptional({
    example: 289,
    description: 'Subject property area in m². Auto-looked up from recent sales if omitted.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(999999)
  subjectArea?: number;

  @ApiProperty({
    example: '2024-07-01',
    description: 'Valuation date — date threshold is calculated server-side (YYYY-MM-DD)',
  })
  @IsDateString()
  valuationDate: string;

  @ApiPropertyOptional({ default: true, description: 'true = strata lots only; false = freehold only' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null) return true;
    if (typeof value === 'boolean') return value;
    return String(value) === 'true';
  })
  @IsBoolean()
  isStrata: boolean = true;

  @ApiPropertyOptional({
    default: 36,
    minimum: 1,
    maximum: 120,
    description: 'Months prior to valuationDate to include',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  monthsLookback: number = 36;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}
