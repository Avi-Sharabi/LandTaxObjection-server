import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CategorizedDeadlineResponseDto } from './dto/categorized-deadline-response.dto';
import { GetDeadlinesQueryDto } from './dto/get-deadlines-query.dto';
import { DeadlinesService } from './deadlines.service';

@ApiTags('deadlines')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'deadlines', version: '1' })
export class DeadlinesController {
  constructor(private readonly deadlinesService: DeadlinesService) {}

  @Get()
  @ApiOkResponse({ type: CategorizedDeadlineResponseDto })
  getDeadlines(@Query() query: GetDeadlinesQueryDto): Promise<CategorizedDeadlineResponseDto> {
    return this.deadlinesService.getDeadlineCases(query);
  }
}
