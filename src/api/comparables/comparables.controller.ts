import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ComparablesService } from './comparables.service';
import { CreateComparableDto } from './dto/create-comparable.dto';
import { ComparableResponseDto } from './dto/comparable-response.dto';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';

@ApiTags('comparables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'comparables',
  version: '1',
})
export class ComparablesController {
  constructor(private readonly comparablesService: ComparablesService) {}

  @Post()
  @ApiOperation({ summary: 'Add a comparable sale to a dispute case' })
  @ApiResponse({ status: 201, type: ComparableResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error or sale date is in the future' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  async create(
    @Body() dto: CreateComparableDto,
    @Request() req: { user: AuthResponseDto },
  ): Promise<ComparableResponseDto> {
    return this.comparablesService.create(dto.dispute_case_id, dto, req.user.id);
  }

  @Get(':applicationId')
  @ApiOperation({ summary: 'List all comparable sales for a dispute case' })
  @ApiParam({ name: 'applicationId', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, type: [ComparableResponseDto] })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  async findByApplicationId(
    @Param('applicationId') applicationId: string,
  ): Promise<ComparableResponseDto[]> {
    return this.comparablesService.findByApplicationId(applicationId);
  }
}
