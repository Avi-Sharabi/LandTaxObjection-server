import { ApiProperty } from '@nestjs/swagger';

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

export class DashboardResponseDto {
  @ApiProperty({ type: StatusCountersDto })
  status_counters: StatusCountersDto;

  @ApiProperty({ type: [DeadlineRiskCaseDto] })
  deadline_risk: DeadlineRiskCaseDto[];

  @ApiProperty({ type: [Object], description: 'Placeholder — wired in a future task' })
  recent_activities: object[];
}
