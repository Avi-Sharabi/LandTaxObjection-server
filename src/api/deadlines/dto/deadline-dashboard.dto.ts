import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { DeadlineStatus, DeadlinePriority } from '../entities/deadline.entity';

export class DeadlineDashboardQueryDto {
  @ApiPropertyOptional({ description: 'Filter cards by assigned owner UUID' })
  @IsOptional()
  @IsUUID()
  assignedOwnerId?: string;
}

export class DeadlineDashboardCardDto {
  @ApiProperty()
  deadlineId: string;

  @ApiProperty()
  caseId: string;

  @ApiProperty({ example: 'C-0041' })
  caseReference: string;

  @ApiProperty({ description: 'Dispute case status (e.g. draft, in_progress, submitted)' })
  caseStatus: string;

  @ApiProperty({ example: 'Sarah Mitchell' })
  clientName: string;

  @ApiProperty({ example: '45 George Street, Sydney NSW 2000' })
  propertyAddress: string;

  @ApiProperty()
  dueDate: Date;

  @ApiProperty({ description: 'Positive = days remaining, negative = days overdue' })
  daysUntilDue: number;

  @ApiProperty({ enum: DeadlineStatus })
  deadlineStatus: DeadlineStatus;

  @ApiProperty({ enum: DeadlinePriority })
  priority: DeadlinePriority;

  @ApiPropertyOptional({ nullable: true })
  assignedOwner: { id: string; name: string | null } | null;
}

export class DeadlineDashboardCountsDto {
  @ApiProperty()
  safe: number;

  @ApiProperty()
  approaching: number;

  @ApiProperty()
  urgentOverdue: number;
}

export class DeadlineDashboardResponseDto {
  @ApiProperty({ type: [DeadlineDashboardCardDto], description: 'Deadlines with status UPCOMING' })
  safe: DeadlineDashboardCardDto[];

  @ApiProperty({ type: [DeadlineDashboardCardDto], description: 'Deadlines with status DUE_SOON or AT_RISK' })
  approaching: DeadlineDashboardCardDto[];

  @ApiProperty({ type: [DeadlineDashboardCardDto], description: 'Deadlines with status OVERDUE' })
  urgentOverdue: DeadlineDashboardCardDto[];

  @ApiProperty({ type: DeadlineDashboardCountsDto })
  counts: DeadlineDashboardCountsDto;
}
