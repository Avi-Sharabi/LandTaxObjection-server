import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsEmail, IsUUID } from 'class-validator';
import { ClientStatus } from '../entities/client.entity';

export class CreateClientDto {

  @ApiProperty({
    example: 'ABC Holdings Pty Ltd',
    description: 'Client name',
  })
  @IsString()
  name: string;

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
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: '+61498765432',
  })
  @IsOptional()
  @IsString()
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

  @ApiPropertyOptional({
    example: 'Australia',
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    example: '12345678901',
    description: 'Australian Business Number',
  })
  @IsOptional()
  @IsString()
  business_number?: string;

  @ApiPropertyOptional({
    example: 'ACN123456',
  })
  @IsOptional()
  @IsString()
  company_number?: string;

  @ApiPropertyOptional({
    example: 'CLIENT001',
  })
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