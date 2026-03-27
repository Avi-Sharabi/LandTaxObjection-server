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

import { DisputeConstraintsService } from './dispute-constraints.service';
import { CreateDisputeConstraintDto, UpdateDisputeConstraintDto } from './dto/create-dispute-constraint.dto';
import { UploadConstraintFilesDto } from './dto/upload-constraint-files.dto';
import { DisputeConstraintResponseDto, ConstraintFileUrlDto } from './dto/dispute-constraint-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';

@ApiTags('Dispute Constraints')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'dispute-constraints', version: '1' })
export class DisputeConstraintsController {
  constructor(private readonly service: DisputeConstraintsService) {}

  /**
   * POST /api/v1/dispute-constraints
   * Create a constraint and optionally upload all supporting files in one call.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a dispute constraint (optionally with files in the same call)' })
  @ApiResponse({ status: 201, type: DisputeConstraintResponseDto })
  async create(
    @Body() dto: CreateDisputeConstraintDto,
    @Request() req: { user: AuthResponseDto },
  ): Promise<DisputeConstraintResponseDto> {
    return this.service.create(dto, req.user.id);
  }

  /**
   * GET /api/v1/dispute-constraints/:disputeId
   * List all constraints for a dispute case.
   */
  @Get(':disputeId')
  @ApiOperation({ summary: 'List all constraints for a dispute case' })
  @ApiParam({ name: 'disputeId', description: 'UUID of the dispute case' })
  @ApiResponse({ status: 200, type: [DisputeConstraintResponseDto] })
  async findByDispute(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
  ): Promise<DisputeConstraintResponseDto[]> {
    return this.service.findByDispute(disputeId);
  }

  /**
   * PATCH /api/v1/dispute-constraints/detail/:id
   * Update scalar fields (description, disputed_value, sort_order).
   * constraint_type and dispute_id are immutable.
   */
  @Patch('detail/:id')
  @ApiOperation({ summary: 'Update a dispute constraint (description, disputed_value, sort_order)' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({ status: 200, type: DisputeConstraintResponseDto })
  @ApiResponse({ status: 404, description: 'Not found.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDisputeConstraintDto,
  ): Promise<DisputeConstraintResponseDto> {
    return this.service.update(id, dto);
  }

  /**
   * GET /api/v1/dispute-constraints/detail/:id/files
   * Get short-lived SAS URLs for all files on a constraint.
   */
  @Get('detail/:id/files')
  @ApiOperation({ summary: 'Get time-limited SAS URLs for all files on a constraint' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id:            { type: 'string', format: 'uuid' },
              url:           { type: 'string' },
              original_name: { type: 'string' },
              mime_type:     { type: 'string' },
            },
          },
        },
      },
    },
  })
  async getFileUrls(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ files: ConstraintFileUrlDto[] }> {
    const files = await this.service.getFileUrls(id);
    return { files };
  }

  /**
   * POST /api/v1/dispute-constraints/detail/:id/files
   * Upload one or more files to an existing constraint in a single call.
   */
  @Post('detail/:id/files')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload multiple files to an existing constraint (single API call)' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({
    status: 201,
    description: 'All files uploaded. Returns updated SAS URL list.',
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id:            { type: 'string', format: 'uuid' },
              url:           { type: 'string' },
              original_name: { type: 'string' },
              mime_type:     { type: 'string' },
            },
          },
        },
      },
    },
  })
  async addFiles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadConstraintFilesDto,
    @Request() req: { user: AuthResponseDto },
  ): Promise<{ files: ConstraintFileUrlDto[] }> {
    const files = await this.service.addFiles(id, dto, req.user.id);
    return { files };
  }

  /**
   * DELETE /api/v1/dispute-constraints/detail/:id
   * Remove a constraint and all its files.
   */
  @Delete('detail/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a dispute constraint and all its files' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }

  /**
   * DELETE /api/v1/dispute-constraints/detail/:id/files/:fileId
   * Remove a single file from a constraint.
   */
  @Delete('detail/:id/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a single file from a constraint' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiParam({ name: 'fileId', description: 'File UUID' })
  @ApiResponse({ status: 204 })
  async removeFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ): Promise<void> {
    return this.service.removeFile(id, fileId);
  }
}
