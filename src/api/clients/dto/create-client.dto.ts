import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsEmail, IsUUID, IsDateString, Matches } from 'class-validator';
import { ClientStatus } from '../entities/client.entity';

export class CreateClientDto {

  @ApiProperty({ example: 'ABC Holdings Pty Ltd', description: 'Client name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Mr' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Male' })
  @IsOptional()
  @IsString()
  gender?: string;


  @ApiPropertyOptional({ example: '1980-01-15' })
  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @ApiPropertyOptional({
    example: 'client@email.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: '+61412345678',
  })
  @IsOptional()
  @Matches(/^\+?[0-9]{6,15}$/, { message: 'phone must contain digits only (optional leading +)' })
  phone?: string;

  @ApiPropertyOptional({
    example: '+61498765432',
  })
  @IsOptional()
  @Matches(/^\+?[0-9]{6,15}$/, { message: 'mobile must contain digits only (optional leading +)' })
  mobile?: string;

  @ApiPropertyOptional({
    example: '123 George St',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    example: 'Sydney',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    example: 'NSW',
  })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({
    example: '2000',
  })
  @IsOptional()
  @IsString()
  postcode?: string;

  @ApiPropertyOptional({ example: 'Australia' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: '123 George St' })
  @IsOptional()
  @IsString()
  postal_address?: string;

  @ApiPropertyOptional({ example: 'Sydney' })
  @IsOptional()
  @IsString()
  postal_city?: string;

  @ApiPropertyOptional({ example: 'NSW' })
  @IsOptional()
  @IsString()
  postal_region?: string;

  @ApiPropertyOptional({ example: '2000' })
  @IsOptional()
  @IsString()
  postal_postcode?: string;

  @ApiPropertyOptional({ example: 'Australia' })
  @IsOptional()
  @IsString()
  postal_country?: string;

  @ApiPropertyOptional({ example: '12345678901', description: 'Australian Business Number' })
  @IsOptional()
  @IsString()
  business_number?: string;

  @ApiPropertyOptional({
    example: 'ACN123456',
  })
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

  @ApiPropertyOptional({
    example: 'xpm',
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({
    example: '123456',
  })
  @IsOptional()
  @IsString()
  source_id?: string;

  @ApiPropertyOptional({
    enum: ClientStatus,
    example: ClientStatus.PROSPECT,
  })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiPropertyOptional({
    example: 'uuid-of-accountant',
  })
  @IsOptional()
  @IsUUID()
  assigned_accountant_id?: string;
}