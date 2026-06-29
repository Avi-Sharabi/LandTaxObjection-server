import { ApiProperty } from '@nestjs/swagger';
import { DeadlineCaseResponseDto } from './deadline-case-response.dto';

export class CategorizedDeadlineResponseDto {
  @ApiProperty({ type: [DeadlineCaseResponseDto] })
  safe: DeadlineCaseResponseDto[];

  @ApiProperty({ type: [DeadlineCaseResponseDto] })
  approaching: DeadlineCaseResponseDto[];

  @ApiProperty({ type: [DeadlineCaseResponseDto] })
  urgent: DeadlineCaseResponseDto[];

  @ApiProperty({ description: 'Total safe cases' })
  safeTotal: number;

  @ApiProperty({ description: 'Total approaching cases' })
  approachingTotal: number;

  @ApiProperty({ description: 'Total urgent cases' })
  urgentTotal: number;

  @ApiProperty({ description: 'Grand total across all categories' })
  total: number;

  @ApiProperty({ description: 'True if the safe category has more pages' })
  safeHasMore: boolean;

  @ApiProperty({ description: 'True if the approaching category has more pages' })
  approachingHasMore: boolean;

  @ApiProperty({ description: 'True if the urgent category has more pages' })
  urgentHasMore: boolean;
}
