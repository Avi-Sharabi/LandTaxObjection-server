import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { SiteConstraintsService } from './site-constraints.service';
import {
  CreateSiteConstraintDto,
  UpdateSiteConstraintDto,
  SiteConstraintResponseDto,
} from './dto/site-constraint.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Site Constraints')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/constraints')
export class SiteConstraintsController {
  constructor(private readonly service: SiteConstraintsService) {}

  // POST /constraints
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a site constraint to a dispute case',
    description:
      'Creates a SiteConstraint record and automatically checks for ' +
      'supporting documents in dispute_documents.',
  })
  @ApiResponse({ status: 201, type: SiteConstraintResponseDto })
  @ApiResponse({ status: 400, description: 'Duplicate constraint type or invalid payload.' })
  create(
    @Body() dto: CreateSiteConstraintDto,
    @Request() req: any,
  ): Promise<SiteConstraintResponseDto> {
    const userId = req.user?.sub ?? req.user?.id ?? 'unknown';
    return this.service.create(dto, userId) as any;
  }

  // GET /constraints/:disputeId
  @Get(':disputeId')
  @ApiOperation({ summary: 'Get all site constraints for a dispute case' })
  @ApiParam({ name: 'disputeId', description: 'UUID of the dispute case' })
  @ApiResponse({ status: 200, type: [SiteConstraintResponseDto] })
  findByDispute(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
  ): Promise<SiteConstraintResponseDto[]> {
    return this.service.findByDispute(disputeId) as any;
  }

  // GET /constraints/detail/:id
  @Get('detail/:id')
  @ApiOperation({ summary: 'Get a single site constraint by ID' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({ status: 200, type: SiteConstraintResponseDto })
  @ApiResponse({ status: 404, description: 'Not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SiteConstraintResponseDto> {
    return this.service.findOne(id) as any;
  }

  // PATCH /constraints/detail/:id
  @Patch('detail/:id')
  @ApiOperation({ summary: 'Update a site constraint' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({ status: 200, type: SiteConstraintResponseDto })
  @ApiResponse({ status: 404, description: 'Not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSiteConstraintDto,
  ): Promise<SiteConstraintResponseDto> {
    return this.service.update(id, dto) as any;
  }

  // DELETE /constraints/detail/:id
  @Delete('detail/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a site constraint' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}