import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';
import { Jurisdiction } from '../entities/property.entity';

export class CreatePropertyDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  suburb?: string;

  @IsOptional()
  @IsEnum(Jurisdiction)
  state?: Jurisdiction;

  @IsOptional()
  @IsString()
  pid?: string;

  @IsOptional()
  @IsString()
  postcode?: string;

  @IsOptional()
  @IsNumber()
  ownership_pct?: number;

  @IsOptional()
  @IsNumber()
  land_area_sqm?: number;

  @IsOptional()
  @IsString()
  zoning?: string;

  @IsOptional()
  @IsString()
  lot_dp?: string;

  @IsOptional()
  @IsString()
  dimensions?: string;

  @IsOptional()
  @IsNumber()
  height_limit_m?: number;
}
