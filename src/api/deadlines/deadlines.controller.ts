import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetDeadlinesQueryDto } from './dto/get-deadlines-query.dto';
import { PaginatedDeadlinesResponseDto } from './dto/paginated-deadlines-response.dto';
import { DeadlinesService } from './deadlines.service';

@ApiTags('deadlines')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'deadlines', version: '1' })
export class DeadlinesController {
  constructor(private readonly deadlinesService: DeadlinesService) {}

  @Get()
  @ApiOperation({
    summary: 'List dispute cases by statutory-deadline category, paginated',
    description:
      'One category (safe/approaching/urgent) per request, each independently scrollable ' +
      'via its own page/limit. Call once per category to populate a 3-column dashboard.',
  })
  @ApiOkResponse({ type: PaginatedDeadlinesResponseDto })
  getDeadlines(
    @Query() query: GetDeadlinesQueryDto,
  ): Promise<PaginatedDeadlinesResponseDto> {
    return this.deadlinesService.getDeadlineCases(query);
  }
}
