import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsOptional, IsEnum, IsEmail, IsUUID, IsDateString, Matches, MinLength, MaxLength } from 'class-validator';
import { ClientStatus, ClientTitle, ClientGender } from '../entities/client.entity';

const AU_PHONE_REGEX = /^\+61\s[23478]\s[\d\s]{6,15}$/;
const AU_MOBILE_REGEX = /^\+61\s4\s[\d\s]{7,10}$/;
const POSTCODE_REGEX = /^[a-zA-Z0-9\s-]{3,10}$/;

export class CreateClientDto {

  @ApiProperty({ example: 'ABC Holdings Pty Ltd', description: 'Client name' })
  @Transform(({ value }) => value || undefined)
  @IsString()
  @MinLength(2, { message: 'Min 2 characters' })
  @MaxLength(100, { message: 'Max 100 characters' })
  name: string;

  @ApiPropertyOptional({ example: 'Mr.', enum: ClientTitle })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsEnum(ClientTitle, { message: 'Invalid title' })
  title?: ClientTitle;

  @ApiPropertyOptional({ example: 'Male', enum: ClientGender })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsEnum(ClientGender, { message: 'Invalid gender' })
  gender?: ClientGender;

@ApiPropertyOptional({ example: '1985-06-15', description: 'ISO date string (YYYY-MM-DD)' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsDateString({}, { message: 'Invalid date' })
  date_of_birth?: string;

  @ApiPropertyOptional({ example: 'client@email.com' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  @MaxLength(255, { message: 'Max 255 characters' })
  email?: string;

  @ApiPropertyOptional({ example: '+61 2 98765432', description: 'Australian phone — format: +61 [23478] [local]' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsString()
  @MaxLength(25)
  @Matches(AU_PHONE_REGEX, { message: 'Invalid Australian phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: '+61 4 12345678', description: 'Australian mobile — format: +61 4 [local]' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsString()
  @MaxLength(25)
  @Matches(AU_MOBILE_REGEX, { message: 'Invalid Australian mobile number' })
  mobile?: string;

  @ApiPropertyOptional({ example: '123 George St' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Max 255 characters' })
  address?: string;

  @ApiPropertyOptional({ example: 'Sydney' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Max 100 characters' })
  city?: string;

  @ApiPropertyOptional({ example: 'NSW' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Max 100 characters' })
  region?: string;

  @ApiPropertyOptional({ example: '2000', description: 'Alphanumeric postcode, 3–10 chars' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @Matches(POSTCODE_REGEX, { message: 'Invalid postcode' })
  @MaxLength(10, { message: 'Max 10 characters' })
  postcode?: string;

  @ApiPropertyOptional({ example: 'Australia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: '123 George St' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Max 255 characters' })
  postal_address?: string;

  @ApiPropertyOptional({ example: 'Sydney' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Max 100 characters' })
  postal_city?: string;

  @ApiPropertyOptional({ example: 'NSW' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Max 100 characters' })
  postal_region?: string;

  @ApiPropertyOptional({ example: '2000', description: 'Alphanumeric postcode, 3–10 chars' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @Matches(POSTCODE_REGEX, { message: 'Invalid postcode' })
  @MaxLength(10, { message: 'Max 10 characters' })
  postal_postcode?: string;

  @ApiPropertyOptional({ example: 'Australia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  postal_country?: string;

  @ApiPropertyOptional({ example: '12345678901', description: 'Australian Business Number' })
  @IsOptional()
  @IsString()
  business_number?: string;

  @ApiPropertyOptional({ example: 'ACN123456' })
  @IsOptional()
  @IsString()
  company_number?: string;

  @ApiPropertyOptional({ example: 'Pty Ltd' })
  @IsOptional()
  @IsString()
  business_structure?: string;

  @ApiPropertyOptional({ example: '12345678' })
  @IsOptional()
  @IsString()
  tax_number?: string;

  @ApiPropertyOptional({ example: '+6129876543' })
  @IsOptional()
  @Matches(/^\+?[0-9]{6,15}$/, { message: 'fax must contain digits only (optional leading +)' })
  fax?: string;

  @ApiPropertyOptional({ example: 'https://example.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'Referral' })
  @IsOptional()
  @IsString()
  referral_source?: string;

  @ApiPropertyOptional({ example: 'CLIENT001' })
  @IsOptional()
  @IsString()
  client_code?: string;

  @ApiPropertyOptional({ example: 'xpm' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  source_id?: string;

  @ApiPropertyOptional({ enum: ClientStatus, example: ClientStatus.PROSPECT })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiPropertyOptional({ example: 'uuid-of-accountant' })
  @IsOptional()
  @IsUUID()
  assigned_accountant_id?: string;
}
