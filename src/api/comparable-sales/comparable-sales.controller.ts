import {
  Controller,
  Get,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ComparableSalesService } from './comparable-sales.service';
import { ComparableSalesQueryDto, ComparableSalesSqlSearchDto } from './dto/comparable-sales.dto';
import {
  ComparableSalesAiQueryResponse,
  ComparableSalesResponse,
} from './comparable-sales.interface';

@ApiTags('comparable-sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@Controller({ path: 'comparable-sales', version: '1' })
export class ComparableSalesController {
  constructor(private readonly comparableSalesService: ComparableSalesService) {}


  @Get('sql-search')
  @ApiOperation({
    summary: 'AI-generated SQL search for comparable sales',
    description:
      'Uses Claude (Skill 03) to generate a parameterised query from subject property details, then executes it against property_sales_raw. The generated SQL is returned alongside results for transparency.',
  })
  @ApiResponse({ status: 200, description: 'Raw comparable sales from Claude-generated query' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Generated SQL failed safety validation' })
  @ApiResponse({ status: 502, description: 'Anthropic API unreachable' })
  @ApiResponse({ status: 503, description: 'Anthropic API rate limited' })
  async sqlSearch(@Query() dto: ComparableSalesSqlSearchDto): Promise<ComparableSalesAiQueryResponse> {
    return this.comparableSalesService.searchViaClaude(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Search property_sales_raw for comparable sales',
    description:
      'Returns ranked comparable sales sorted by area proximity. Applies an auto-correction cascade if fewer than 3 results are found. Corrections and data quality warnings are returned in meta.',
  })
  @ApiResponse({
    status: 200,
    description: 'Comparable sales with auto-correction cascade metadata and warnings',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async search(@Query() dto: ComparableSalesQueryDto): Promise<ComparableSalesResponse> {
    return this.comparableSalesService.search(dto);
  }
}
