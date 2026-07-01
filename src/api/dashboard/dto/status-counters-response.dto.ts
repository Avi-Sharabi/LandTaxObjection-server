import { ApiProperty } from '@nestjs/swagger';

export class StatusCountersResponseDto {
  @ApiProperty({ example: 131, description: 'Dispute cases not in a terminal status (closed / vg_approved / vg_declined)' })
  active_cases_count: number;

  @ApiProperty({ example: 5, description: 'Active cases whose statutory_deadline falls within the next 7 days' })
  due_this_week_count: number;

  @ApiProperty({ example: 50, description: 'Active cases whose statutory_deadline has already passed' })
  overdue_count: number;
}
