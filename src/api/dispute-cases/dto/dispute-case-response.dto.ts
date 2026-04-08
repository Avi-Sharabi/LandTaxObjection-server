import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeStatus, Jurisdiction, OutcomeResult } from '../entities/dispute-case.entity';

export class DisputeCaseResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  case_reference: string;

  @ApiProperty()
  client_id: string;

  @ApiProperty()
  property_id: string;

  @ApiProperty()
  valuation_notice_id: string;

  @ApiPropertyOptional()
  assigned_accountant_id: string | null;

  @ApiPropertyOptional()
  assigned_lawyer_id: string | null;

  @ApiProperty({ enum: Jurisdiction })
  jurisdiction: Jurisdiction;

  @ApiProperty({ enum: DisputeStatus })
  status: DisputeStatus;

  @ApiProperty()
  statutory_deadline: Date;

  @ApiProperty()
  no_legal_ground_flagged: boolean;

  @ApiProperty()
  flag_heritage: boolean;

  @ApiProperty()
  flag_easement: boolean;

  @ApiProperty()
  flag_flood_zone: boolean;

  @ApiProperty()
  flag_environmental: boolean;

  @ApiProperty()
  flag_zoning: boolean;

  @ApiPropertyOptional()
  evidence_strength_score: number | null;

  @ApiPropertyOptional()
  original_assessed_value: number | null;

  @ApiPropertyOptional()
  final_agreed_value: number | null;

  @ApiPropertyOptional()
  tax_saving_achieved: number | null;

  @ApiPropertyOptional()
  invoice_amount: number | null;

  @ApiPropertyOptional({ enum: OutcomeResult })
  outcome: OutcomeResult | null;

  @ApiPropertyOptional()
  notes: string | null;

  @ApiPropertyOptional()
  reminder_count: number | null;

  @ApiPropertyOptional()
  client_approval_requested_at: Date | null;

  @ApiPropertyOptional()
  client_approved_at: Date | null;

  @ApiPropertyOptional()
  last_reminder_sent_at: Date | null;

  @ApiPropertyOptional()
  submitted_at: Date | null;

  @ApiPropertyOptional()
  closed_at: Date | null;

  @ApiPropertyOptional()
  vg_response_received_at: Date | null;

  @ApiPropertyOptional()
  lodgment_reference_number: string | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
