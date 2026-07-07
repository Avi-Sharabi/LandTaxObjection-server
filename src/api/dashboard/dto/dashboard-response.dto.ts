import { ApiProperty } from '@nestjs/swagger';
import { AuditAction } from '../../audit-log/entities/audit-log.entity';

export class StatusCountersDto {
  @ApiProperty({ example: 131 }) active_cases_count: number;
  @ApiProperty({ example: 5 }) due_this_week_count: number;
  @ApiProperty({ example: 50 }) overdue_count: number;
}

export class DeadlineRiskCaseDto {
  @ApiProperty() id: string;
  @ApiProperty() case_reference: string;
  @ApiProperty() property_address: string;
  @ApiProperty() client_name: string;
  @ApiProperty({ nullable: true }) statutory_deadline: string | null;
}

export class RecentActivityDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: AuditAction }) action: AuditAction;
  @ApiProperty() description: string;
  @ApiProperty() category: string;
  @ApiProperty() color_hint: string;
  @ApiProperty() case_id: string;
  @ApiProperty({ nullable: true }) case_reference: string | null;
  @ApiProperty({ nullable: true }) performed_by_name: string | null;
  @ApiProperty() created_at: string;
}

export class DashboardResponseDto {
  @ApiProperty({ type: StatusCountersDto })
  status_counters: StatusCountersDto;

  @ApiProperty({ type: [DeadlineRiskCaseDto] })
  deadline_risk: DeadlineRiskCaseDto[];

  @ApiProperty({ type: [RecentActivityDto] })
  recent_activities: RecentActivityDto[];
}
