import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Jurisdiction, DisputeStatus } from '../../dispute-cases/entities/dispute-case.entity';
import { DeadlineRiskLevel } from './deadline-risk-query.dto';

export class DeadlineRiskItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  case_reference: string;

  @ApiProperty({ enum: DeadlineRiskLevel })
  risk_level: DeadlineRiskLevel;

  @ApiProperty({ description: 'Negative values indicate the case is overdue by that many days' })
  days_until_deadline: number;

  @ApiProperty()
  statutory_deadline: Date;

  @ApiProperty({ enum: Jurisdiction })
  jurisdiction: Jurisdiction;

  @ApiProperty({ enum: DisputeStatus })
  status: DisputeStatus;

  @ApiProperty()
  status_label: string;

  @ApiProperty()
  client_id: string;

  @ApiPropertyOptional({ nullable: true })
  client_name: string | null;

  @ApiPropertyOptional({ nullable: true })
  assigned_accountant_name: string | null;

  @ApiProperty()
  property_id: string;

  @ApiPropertyOptional({ nullable: true })
  property_address: string | null;

  @ApiPropertyOptional({ nullable: true })
  property_suburb: string | null;

  @ApiPropertyOptional({ nullable: true })
  property_postcode: string | null;
}

export class DeadlineRiskThresholdsDto {
  @ApiProperty({ description: 'Cases due within this many days are classified as at_risk' })
  at_risk_days: number;

  @ApiProperty({ description: 'Cases due within this many days (but beyond at_risk_days) are classified as due_soon' })
  due_soon_days: number;
}

export class DeadlineRiskResponseDto {
  @ApiProperty({ type: [DeadlineRiskItemDto] })
  items: DeadlineRiskItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty({ type: DeadlineRiskThresholdsDto })
  thresholds: DeadlineRiskThresholdsDto;
}
