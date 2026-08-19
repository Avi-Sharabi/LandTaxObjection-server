import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { DeadlineCaseResponseDto } from './deadline-case-response.dto';

// Generics erase at runtime and this repo has no @nestjs/swagger CLI plugin (nothing is
// inferred from types), so the item type has to be re-declared for Swagger to see it.
export class PaginatedDeadlinesResponseDto extends PaginatedResponseDto<DeadlineCaseResponseDto> {
  @ApiProperty({ type: [DeadlineCaseResponseDto] })
  declare data: DeadlineCaseResponseDto[];
}
