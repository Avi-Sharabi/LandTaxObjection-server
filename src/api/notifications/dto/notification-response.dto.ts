import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { NotificationType } from '../entities/notification.entity';

export class NotificationResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @Expose()
  id: string;

  @ApiProperty({ enum: NotificationType, example: NotificationType.APPROVAL_REMINDER })
  @Expose()
  type: NotificationType;

  @ApiProperty({ example: 'Statutory deadline in 7 days for LTD-2024-003' })
  @Expose()
  message: string;

  @ApiProperty({ example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901', nullable: true })
  @Expose()
  caseId: string | null;

  @ApiProperty({ example: false })
  @Expose()
  read: boolean;

  @ApiProperty({ example: '2024-06-01T10:00:00.000Z' })
  @Expose()
  createdAt: Date;
}
