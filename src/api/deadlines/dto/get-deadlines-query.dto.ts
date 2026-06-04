import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
  IsIn,
} from 'class-validator';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';
import {
  DeadlineEntityType,
  DeadlineType,
  DeadlineStatus,
  DeadlinePriority,
} from '../entities/deadline.entity';

export class GetDeadlinesQueryDto extends PaginatedQueryDto {
  @ApiPropertyOptional({ description: 'Filter by entity ID' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ enum: DeadlineEntityType })
  @IsOptional()
  @IsEnum(DeadlineEntityType)
  entityType?: DeadlineEntityType;

  @ApiPropertyOptional({ enum: DeadlineStatus })
  @IsOptional()
  @IsEnum(DeadlineStatus)
  status?: DeadlineStatus;

  @ApiPropertyOptional({ enum: DeadlineType })
  @IsOptional()
  @IsEnum(DeadlineType)
  deadlineType?: DeadlineType;

  @ApiPropertyOptional({ description: 'Filter by assigned owner UUID' })
  @IsOptional()
  @IsUUID()
  assignedOwnerId?: string;

  @ApiPropertyOptional({ enum: DeadlinePriority })
  @IsOptional()
  @IsEnum(DeadlinePriority)
  priority?: DeadlinePriority;

  @ApiPropertyOptional({ description: 'Filter deadlines due on or after this ISO date' })
  @IsOptional()
  @IsDateString()
  dueDateStart?: string;

  @ApiPropertyOptional({ description: 'Filter deadlines due on or before this ISO date' })
  @IsOptional()
  @IsDateString()
  dueDateEnd?: string;

  @ApiPropertyOptional({ enum: ['dueDate', 'createdAt', 'priority', 'status'] })
  @IsOptional()
  @IsIn(['dueDate', 'createdAt', 'priority', 'status'])
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
