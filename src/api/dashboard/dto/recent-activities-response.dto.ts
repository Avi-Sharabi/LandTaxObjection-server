import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditAction } from '../../audit-log/entities/audit-log.entity';

export class ActivityItemDto {
  @ApiProperty({ description: 'Unique identifier of the audit log entry' })
  id: string;

  @ApiProperty({ enum: AuditAction, description: 'Type of activity performed' })
  action: AuditAction;

  @ApiPropertyOptional({ description: 'Type of entity that was acted upon (e.g. dispute_case, document)', nullable: true })
  entityType: string | null;

  @ApiPropertyOptional({ description: 'UUID of the entity that was acted upon', nullable: true })
  entityId: string | null;

  @ApiPropertyOptional({ description: 'Human-readable description of the activity', nullable: true })
  description: string | null;

  @ApiPropertyOptional({ description: 'Additional context data (e.g. old/new status values)', nullable: true, type: Object })
  metadata: Record<string, unknown> | null;

  @ApiProperty({ description: 'UUID of the user who performed the action' })
  performedBy: string;

  @ApiPropertyOptional({ description: 'Full name of the user at the time the action was performed', nullable: true })
  performedByName: string | null;

  @ApiProperty({ description: 'UUID of the dispute case associated with this activity' })
  caseId: string;

  @ApiPropertyOptional({ description: 'Human-readable case reference (e.g. LTD-2026-ARV-001)', nullable: true })
  caseReference: string | null;

  @ApiPropertyOptional({ description: 'VG lodgment reference number, if applicable', nullable: true })
  lodgmentReferenceNumber: string | null;

  @ApiProperty({ description: 'UTC ISO-8601 timestamp of when the activity occurred' })
  createdAt: string;
}

export class RecentActivitiesResponseDto {
  @ApiProperty({ type: [ActivityItemDto], description: 'Activity records ordered by most recent first' })
  data: ActivityItemDto[];

  @ApiProperty({ description: 'Total number of records matching the applied filters' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;
}
