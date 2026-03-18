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

@ApiTags('Site Constraints')
@ApiBearerAuth()
@Controller('constraints')
export class SiteConstraintsController {
  constructor(private readonly service: SiteConstraintsService) {}

  // POST /constraints
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a site constraint to a dispute case',
    description:
      'Creates a SiteConstraint record. Automatically checks for supporting documents ' +
      'in dispute_documents and emails the client if any are missing.',
  })
  @ApiResponse({ status: 201, type: SiteConstraintResponseDto })
  @ApiResponse({ status: 400, description: 'Duplicate constraint type or invalid payload.' })
  create(@Body() dto: CreateSiteConstraintDto): Promise<SiteConstraintResponseDto> {
    return this.service.create(dto) as any;
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
  @ApiOperation({
    summary: 'Update a site constraint',
    description:
      'Updates description, legal_argument, or document_blob_url. ' +
      'If document_blob_url is provided, re-runs document verification.',
  })
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

  // POST /constraints/detail/:id/retry-verification
  @Post('detail/:id/retry-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually re-trigger document verification and missing-doc email',
  })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({ status: 200, schema: { example: { message: 'Verification retry complete.' } } })
  async retryVerification(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.service.retryVerification(id);
    return { message: 'Verification retry complete.' };
  }
}
