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
import { CreateSiteConstraintDto, UpdateSiteConstraintDto } from './dto/create-site-constraints.dto';
import { SiteConstraintResponseDto } from './dto/site-constraints-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';

@ApiTags('Site Constraints')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'constraints',
  version: '1',
})
export class SiteConstraintsController {
  constructor(private readonly service: SiteConstraintsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a site constraint to a dispute case' })
  @ApiResponse({ status: 201, type: SiteConstraintResponseDto })
  @ApiResponse({ status: 400, description: 'Duplicate constraint type or invalid payload.' })
  async create(
    @Body() dto: CreateSiteConstraintDto,
    @Request() req: { user: AuthResponseDto },
  ): Promise<SiteConstraintResponseDto> {
    return this.service.create(dto, req.user.id);
  }

  @Get(':disputeId')
  @ApiOperation({ summary: 'Get all site constraints for a dispute case' })
  @ApiParam({ name: 'disputeId', description: 'UUID of the dispute case' })
  @ApiResponse({ status: 200, type: [SiteConstraintResponseDto] })
  async findByDispute(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
  ): Promise<SiteConstraintResponseDto[]> {
    return this.service.findByDispute(disputeId);
  }

  @Get('detail/:id')
  @ApiOperation({ summary: 'Get a single site constraint by ID' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({ status: 200, type: SiteConstraintResponseDto })
  @ApiResponse({ status: 404, description: 'Not found.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SiteConstraintResponseDto> {
    return this.service.findOne(id);
  }

  /**
   * GET /constraints/detail/:id/document
   *
   * Returns a short-lived SAS URL ({ url: string | null }) for the constraint's
   * supporting document. The URL expires after 60 minutes.
   * The raw blob path stored in the DB is never included in the response.
   */
  @Get('detail/:id/document')
  @ApiOperation({ summary: 'Get a time-limited document URL for a site constraint' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({
    status: 200,
    description: 'Short-lived SAS URL (60 min expiry), or null if no document uploaded.',
    schema: { type: 'object', properties: { url: { type: 'string', nullable: true } } },
  })
  @ApiResponse({ status: 404, description: 'Constraint not found.' })
  async getDocumentUrl(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ url: string | null }> {
    const url = await this.service.getDocumentUrl(id);
    return { url };
  }

  @Patch('detail/:id')
  @ApiOperation({ summary: 'Update a site constraint' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({ status: 200, type: SiteConstraintResponseDto })
  @ApiResponse({ status: 404, description: 'Not found.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSiteConstraintDto,
  ): Promise<SiteConstraintResponseDto> {
    return this.service.update(id, dto);
  }

  @Delete('detail/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a site constraint' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Not found.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}