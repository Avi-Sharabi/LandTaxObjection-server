import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsEnum,
  IsString,
  IsDateString,
  IsOptional,
  MinLength,
} from 'class-validator';
import {
  DeadlineEntityType,
  DeadlineType,
  DeadlinePriority,
} from '../entities/deadline.entity';

export class CreateDeadlineDto {
  @ApiProperty({ description: 'ID of the related entity (e.g. dispute case, property)' })
  @IsUUID()
  entityId: string;

  @ApiProperty({ enum: DeadlineEntityType })
  @IsEnum(DeadlineEntityType)
  entityType: DeadlineEntityType;

  @ApiProperty({ enum: DeadlineType })
  @IsEnum(DeadlineType)
  deadlineType: DeadlineType;

  @ApiProperty({ description: 'Short descriptive title for the deadline' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({ description: 'ISO 8601 date-time string for the due date' })
  @IsDateString()
  dueDate: string;

  @ApiProperty({ description: 'UUID of the user responsible for this deadline' })
  @IsUUID()
  assignedOwnerId: string;

  @ApiProperty({ enum: DeadlinePriority })
  @IsEnum(DeadlinePriority)
  priority: DeadlinePriority;

  @ApiPropertyOptional({ description: 'Optional notes about the deadline' })
  @IsOptional()
  @IsString()
  notes?: string;
}
