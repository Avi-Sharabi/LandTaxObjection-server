import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateComparableDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID()
  dispute_case_id: string;

  @ApiProperty({ example: '5219860', required: false, nullable: true })
  @IsOptional()
  @IsString()
  sale_id?: string | null;

  @ApiProperty({ example: '223_SALES_DATA_NNME_25092023.csv', required: false, nullable: true })
  @IsOptional()
  @IsString()
  source_file?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  imported_at?: string | null;

  @ApiProperty({ example: '223', required: false, nullable: true })
  @IsOptional()
  @IsString()
  district_code?: string | null;

  @ApiProperty({ example: '2929088', required: false, nullable: true })
  @IsOptional()
  @IsString()
  property_id?: string | null;

  @ApiProperty({ example: 35, required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  sale_counter?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  download_datetime?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  property_name?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  property_unit_number?: string | null;

  @ApiProperty({ example: '115', required: false, nullable: true })
  @IsOptional()
  @IsString()
  property_house_number?: string | null;

  @ApiProperty({ example: 'JEDDA RD', required: false, nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  property_street_name?: string | null;

  @ApiProperty({ example: 'PRESTONS', required: false, nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  property_locality?: string | null;

  @ApiProperty({ example: '2170', required: false, nullable: true })
  @IsOptional()
  @IsString()
  property_post_code?: string | null;

  @ApiProperty({ example: 5.326, required: false, nullable: true, description: 'Land area as stored in source (may be ha or m²)' })
  @IsOptional()
  @IsNumber()
  area?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  contract_date?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  settlement_date?: string | null;

  @ApiProperty({ example: 79000000.00, required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  purchase_price?: number | null;

  @ApiProperty({ example: 'E5', required: false, nullable: true })
  @IsOptional()
  @IsString()
  zoning?: string | null;

  @ApiProperty({ example: '3', required: false, nullable: true })
  @IsOptional()
  @IsString()
  nature_of_property?: string | null;

  @ApiProperty({ example: 'WAREHOUSE', required: false, nullable: true })
  @IsOptional()
  @IsString()
  primary_purpose?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  strata_lot_number?: string | null;

  @ApiProperty({ example: 'ITT', required: false, nullable: true })
  @IsOptional()
  @IsString()
  component_code?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  sale_code?: string | null;

  @ApiProperty({ example: 0.00, required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  interest_of_sale_percent?: number | null;

  @ApiProperty({ example: 'AT439913', required: false, nullable: true })
  @IsOptional()
  @IsString()
  dealing_number?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  owner_type?: string | null;

  @ApiProperty({ example: 1483.29, required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  adjusted_rate_per_sqm?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  explanation?: string | null;
}
