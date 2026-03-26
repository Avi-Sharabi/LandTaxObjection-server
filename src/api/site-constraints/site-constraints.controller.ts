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
   * GET /constraints/detail/:id/documents
   *
   * Returns short-lived SAS URLs (60 min expiry) for all documents attached
   * to the constraint. Raw blob paths are never included in the response.
   */
  @Get('detail/:id/documents')
  @ApiOperation({ summary: 'Get time-limited URLs for all documents on a site constraint' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({
    status: 200,
    description: 'Array of { id, url } pairs — one per uploaded document. Empty array if none.',
    schema: {
      type: 'object',
      properties: {
        documents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id:  { type: 'string', format: 'uuid' },
              url: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Constraint not found.' })
  async getDocumentUrls(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ documents: Array<{ id: string; url: string }> }> {
    const documents = await this.service.getDocumentUrls(id);
    return { documents };
  }

  @Patch('detail/:id')
  @ApiOperation({ summary: 'Update a site constraint (appends new attachments)' })
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
  @ApiOperation({ summary: 'Remove a site constraint and all its documents' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Not found.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }

  @Delete('detail/:id/documents/:docId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a single document from a site constraint' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiParam({ name: 'docId', description: 'Document UUID' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Constraint or document not found.' })
  async removeDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ): Promise<void> {
    return this.service.removeDocument(id, docId);
  }
}
