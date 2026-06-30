import { IsDateString, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchComparableSalesArgsDto {
  @IsOptional()
  @IsString()
  suburb?: string;

  @IsOptional()
  @IsString()
  zoning?: string;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  area_min_sqm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  area_max_sqm?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class QueryArgsDto {
  @IsString()
  sql: string;
}

export class DescribeTableArgsDto {
  @IsString()
  table_name: string;
}
