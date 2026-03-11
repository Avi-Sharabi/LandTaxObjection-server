import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { ClientStatus } from '../entities/client.entity';

export class CreateClientDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  abn?: string;

  @IsOptional()
  @IsEmail()
  contact_email?: string;

  @IsOptional()
  @IsString()
  contact_phone?: string;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @IsString()
  assigned_accountant_id?: string;

  @IsOptional()
  @IsString()
  fyi_client_id?: string;

  @IsOptional()
  @IsString()
  valuation_blob_url?: string;
}
