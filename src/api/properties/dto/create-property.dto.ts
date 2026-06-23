import { IsString, IsOptional, IsEnum, IsNumber, MaxLength, Min, Max, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { Jurisdiction } from '../entities/property.entity';

export class CreatePropertyDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  suburb?: string;

  @IsOptional()
  @IsEnum(Jurisdiction)
  state?: Jurisdiction;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  pid?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'postcode must be a 4-digit number' })
  postcode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  ownership_pct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  land_area_sqm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  zoning?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lot_dp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  dimensions?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  height_limit_m?: number;
}
