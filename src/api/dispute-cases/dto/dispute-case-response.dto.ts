import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DisputeStatus,
  Jurisdiction,
  OutcomeResult,
} from '../entities/dispute-case.entity';
import { ValuationNoticeNestedDto } from './valuation-notice-nested.dto';

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

  @ApiProperty()
  is_valuated: boolean;

  @ApiPropertyOptional()
  evidence_strength_score: number | null;

  @ApiPropertyOptional()
  original_assessed_value: number | null;

  @ApiPropertyOptional()
  internal_assessed_value: number | null;

  @ApiPropertyOptional()
  final_agreed_value: number | null;

  @ApiPropertyOptional()
  tax_saving_achieved: number | null;

  @ApiProperty({ default: 20 })
  yml_fee_share_pct: number;

  @ApiPropertyOptional()
  tax_saving: number | null;

  @ApiPropertyOptional()
  yml_revenue: number | null;

  @ApiPropertyOptional()
  client_savings: number | null;

  @ApiPropertyOptional()
  invoice_amount: number | null;

  @ApiPropertyOptional({ enum: OutcomeResult })
  outcome: OutcomeResult | null;

  @ApiPropertyOptional()
  notes: string | null;

  @ApiPropertyOptional()
  submitted_at: Date | null;

  @ApiPropertyOptional()
  lodgment_reference_number: string | null;

  @ApiPropertyOptional({
    description:
      'When the most recent further submission was lodged. Null until the first one. The original ' +
      'submitted_at is never overwritten.',
  })
  resubmitted_at: Date | null;

  @ApiProperty({
    example: 0,
    description:
      'Further submissions sent to the Valuer General. Capped at 3 — a client should read this ' +
      'before offering the ai_further_submission action rather than discovering the cap as a 409.',
  })
  resubmission_count: number;

  @ApiPropertyOptional()
  closed_at: Date | null;

  @ApiPropertyOptional({ nullable: true, type: () => ValuationNoticeNestedDto })
  valuation_notice: ValuationNoticeNestedDto | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
