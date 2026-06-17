import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export type UrgencyCategory = 'safe' | 'approaching' | 'urgent';

export class GetDeadlinesQueryDto {
  @ApiPropertyOptional({
    enum: ['safe', 'approaching', 'urgent'],
    description: 'Filter cases by urgency category',
  })
  @IsOptional()
  @IsIn(['safe', 'approaching', 'urgent'])
  urgency?: UrgencyCategory;
}
