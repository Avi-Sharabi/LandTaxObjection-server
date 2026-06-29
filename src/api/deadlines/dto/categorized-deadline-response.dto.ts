import { ApiProperty } from '@nestjs/swagger';
import { DeadlineCaseResponseDto } from './deadline-case-response.dto';

class HasMoreDto {
  @ApiProperty() safe: boolean;
  @ApiProperty() approaching: boolean;
  @ApiProperty() urgent: boolean;
}

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

  @ApiProperty()
  total: number;

  @ApiProperty({ type: HasMoreDto, description: 'Per-category pagination flags' })
  hasMore: HasMoreDto;
}
