import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

export const DEADLINE_CATEGORIES = ['safe', 'approaching', 'urgent'] as const;
export type DeadlineCategory = (typeof DEADLINE_CATEGORIES)[number];

export class GetDeadlinesQueryDto extends PaginatedQueryDto {
  @ApiProperty({ enum: DEADLINE_CATEGORIES })
  @IsIn(DEADLINE_CATEGORIES)
  category: DeadlineCategory;
}
