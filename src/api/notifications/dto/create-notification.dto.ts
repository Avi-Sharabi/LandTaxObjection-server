import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { NotificationType } from '../entities/notification.entity';

export class CreateNotificationDto {
  @ApiProperty({ description: 'UUID of the user to notify' })
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ example: 'Objection package approved for LTD-2026-001' })
  @IsString()
  @MinLength(1)
  message: string;

  @ApiPropertyOptional({ description: 'Dispute case UUID this notification relates to' })
  @IsOptional()
  @IsUUID()
  caseId?: string;
}
