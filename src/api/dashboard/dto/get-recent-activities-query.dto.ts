import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuditAction } from '../../audit-log/entities/audit-log.entity';

export class GetRecentActivitiesQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1, description: 'Page number (1-based)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: AuditAction, description: 'Filter by a specific activity type' })
  @IsOptional()
  @IsEnum(AuditAction)
  activityType?: AuditAction;

  @ApiPropertyOptional({ type: String, example: '2025-01-01T00:00:00.000Z', description: 'Include activities from this UTC timestamp (inclusive)' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ type: String, example: '2025-12-31T23:59:59.999Z', description: 'Include activities up to this UTC timestamp (inclusive)' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by the UUID of the user who performed the action' })
  @IsOptional()
  @IsUUID()
  performedBy?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by the UUID of the affected entity' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ type: String, example: 'dispute_case', description: 'Filter by entity type (e.g. dispute_case, document, comparable)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;
}
