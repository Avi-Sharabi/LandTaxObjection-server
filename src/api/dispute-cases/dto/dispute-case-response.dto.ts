import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeCase, DisputeStatus, Jurisdiction, OutcomeResult } from '../entities/dispute-case.entity';
import { DecisionOutcome } from '../../valuation-notices/entities/valuation-notice.entity';

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
  submitted_at: Date | null;

  @ApiPropertyOptional()
  closed_at: Date | null;

  @ApiPropertyOptional()
  analysis_report_url: string | null;

  @ApiPropertyOptional()
  valuation_notice: {
    id: string;
    valuation_date: Date;
    assessed_land_value: number | null;
    appraised_value: number | null;
    valuation_delta: number | null;
    decision_outcome: DecisionOutcome | null;
    analyst_notes: string | null;
    notice_reference: string | null;
    benchmark_uplift_pct: number | null;
    is_exempt: boolean;
  } | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  static fromEntity(entity: DisputeCase, analysisReportSasUrl?: string | null): DisputeCaseResponseDto {
    const dto = new DisputeCaseResponseDto();
    dto.id = entity.id;
    dto.case_reference = entity.case_reference;
    dto.client_id = entity.client_id;
    dto.property_id = entity.property_id;
    dto.valuation_notice_id = entity.valuation_notice_id;
    dto.assigned_accountant_id = entity.assigned_accountant_id;
    dto.assigned_lawyer_id = entity.assigned_lawyer_id;
    dto.jurisdiction = entity.jurisdiction;
    dto.status = entity.status;
    dto.statutory_deadline = entity.statutory_deadline;
    dto.no_legal_ground_flagged = entity.no_legal_ground_flagged;
    dto.original_assessed_value = entity.original_assessed_value;
    dto.final_agreed_value = entity.final_agreed_value;
    dto.tax_saving_achieved = entity.tax_saving_achieved;
    dto.invoice_amount = entity.invoice_amount;
    dto.outcome = entity.outcome;
    dto.notes = entity.notes;
    dto.submitted_at = entity.submitted_at;
    dto.closed_at = entity.closed_at;
    dto.analysis_report_url = analysisReportSasUrl ?? null;
    dto.valuation_notice = entity.valuation_notice
      ? {
          id: entity.valuation_notice.id,
          valuation_date: entity.valuation_notice.valuation_date,
          assessed_land_value: entity.valuation_notice.assessed_land_value,
          appraised_value: entity.valuation_notice.appraised_value,
          valuation_delta: entity.valuation_notice.valuation_delta,
          decision_outcome: entity.valuation_notice.decision_outcome,
          analyst_notes: entity.valuation_notice.analyst_notes,
          notice_reference: entity.valuation_notice.notice_reference,
          benchmark_uplift_pct: entity.valuation_notice.benchmark_uplift_pct,
          is_exempt: entity.valuation_notice.is_exempt,
        }
      : null;
    dto.created_at = entity.created_at;
    dto.updated_at = entity.updated_at;
    return dto;
  }
}
