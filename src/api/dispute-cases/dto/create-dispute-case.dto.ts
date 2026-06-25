import { IsString, IsUUID, IsOptional, IsEnum, IsDate, IsBoolean, IsNumber } from 'class-validator';
import { DisputeStatus, OutcomeResult, Jurisdiction } from '../entities/dispute-case.entity';
import { Type } from 'class-transformer';

export class CreateDisputeCaseDto {
  @IsString()
  case_reference: string;

  @IsUUID()
  client_id: string;

  @IsUUID()
  property_id: string;

  @IsUUID()
  valuation_notice_id: string;

  @IsOptional()
  @IsUUID()
  assigned_accountant_id?: string;

  @IsOptional()
  @IsUUID()
  assigned_lawyer_id?: string;

  @IsEnum(Jurisdiction)
  jurisdiction: Jurisdiction;

  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @IsDate()
  @Type(() => Date)
  statutory_deadline: Date;

  @IsOptional()
  @IsBoolean()
  no_legal_ground_flagged?: boolean;

  @IsOptional()
  @IsBoolean()
  flag_heritage?: boolean;

  @IsOptional()
  @IsBoolean()
  flag_easement?: boolean;

  @IsOptional()
  @IsBoolean()
  flag_flood_zone?: boolean;

  @IsOptional()
  @IsBoolean()
  flag_environmental?: boolean;

  @IsOptional()
  @IsBoolean()
  flag_zoning?: boolean;

  @IsOptional()
  @IsNumber()
  evidence_strength_score?: number;

  @IsOptional()
  @IsEnum(OutcomeResult)
  outcome?: OutcomeResult;

  @IsOptional()
  @IsNumber()
  original_assessed_value?: number;

  @IsOptional()
  @IsNumber()
  final_agreed_value?: number;

  @IsOptional()
  @IsNumber()
  tax_saving_achieved?: number;

  @IsOptional()
  @IsNumber()
  invoice_amount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
