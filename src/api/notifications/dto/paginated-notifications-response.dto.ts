import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationResponseDto } from './notification-response.dto';

export class PaginatedNotificationsResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  data: NotificationResponseDto[];

  @ApiPropertyOptional({
    example: '2024-05-31T09:00:00.000Z',
    nullable: true,
    description: 'Pass this as `cursor` in the next request. Null when there are no more pages.',
  })
  nextCursor: string | null;

  @ApiProperty({ example: true })
  hasMore: boolean;

  @ApiProperty({ example: 5, description: 'Total number of unread notifications for the user' })
  totalUnread: number;
}
