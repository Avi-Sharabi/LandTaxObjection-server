import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Exclude } from 'class-transformer';
import {
  DeadlineEntityType,
  DeadlineType,
  DeadlineStatus,
  DeadlinePriority,
} from '../entities/deadline.entity';

@Exclude()
export class DeadlineResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  entityId: string;

  @Expose()
  @ApiProperty({ enum: DeadlineEntityType })
  entityType: DeadlineEntityType;

  @Expose()
  @ApiProperty({ enum: DeadlineType })
  deadlineType: DeadlineType;

  @Expose()
  @ApiProperty()
  title: string;

  @Expose()
  @ApiProperty({ enum: DeadlineStatus })
  status: DeadlineStatus;

  @Expose()
  @ApiProperty()
  dueDate: Date;

  @Expose()
  @ApiProperty()
  assignedOwnerId: string;

  @Expose()
  @ApiProperty({ enum: DeadlinePriority })
  priority: DeadlinePriority;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  cancelledAt: Date | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  cancellationReason: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  completedAt: Date | null;

  @Expose()
  @ApiProperty()
  createdById: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  updatedById: string | null;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @ApiProperty()
  updatedAt: Date;
}
