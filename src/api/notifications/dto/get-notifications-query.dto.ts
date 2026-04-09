import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetNotificationsQueryDto {
  /**
   * ISO-8601 timestamp of the last item from the previous page.
   * Omit on the first request.
   */
  @ApiPropertyOptional({
    example: '2024-06-01T10:00:00.000Z',
    description: 'createdAt of the last item from the previous page (cursor)',
  })
  @IsOptional()
  @IsISO8601()
  cursor?: string;

  @ApiPropertyOptional({ example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
