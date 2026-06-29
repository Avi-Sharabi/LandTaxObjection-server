import { ApiProperty } from '@nestjs/swagger';
import { DeadlineCaseResponseDto } from './deadline-case-response.dto';

export class PaginatedDeadlineResponseDto {
  @ApiProperty({ type: [DeadlineCaseResponseDto] })
  data: DeadlineCaseResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  hasMore: boolean;
}
