import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { DisputeConstraintsService } from './dispute-constraints.service';
import { CreateDisputeConstraintDto } from './dto/create-dispute-constraint.dto';
import { UpdateDisputeConstraintDto } from './dto/update-dispute-constraint.dto';
import { DisputeConstraintResponseDto } from './dto/dispute-constraint-response.dto';
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
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a dispute constraint (optionally with files)' })
  @ApiResponse({ status: 201, type: DisputeConstraintResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Dispute case not found.' })
  async create(
    @Body() dto: CreateDisputeConstraintDto,
    @Request() req: { user: AuthResponseDto },
  ): Promise<DisputeConstraintResponseDto> {
    return this.service.create(dto, req.user.id);
  }

  /**
   * GET /api/v1/dispute-constraints?dispute_id=
   */
  @Get()
  @ApiOperation({ summary: 'List all constraints for a dispute case' })
  @ApiQuery({ name: 'dispute_id', description: 'UUID of the dispute case', type: String })
  @ApiResponse({ status: 200, type: [DisputeConstraintResponseDto] })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Dispute case not found.' })
  async findByDispute(
    @Query('dispute_id', ParseUUIDPipe) disputeId: string,
  ): Promise<DisputeConstraintResponseDto[]> {
    return this.service.findByDispute(disputeId);
  }

  /**
   * PATCH /api/v1/dispute-constraints/:id
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update a dispute constraint (description, files). Pass keep_file_ids to manage existing files.' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({ status: 200, type: DisputeConstraintResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Dispute constraint not found.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDisputeConstraintDto,
    @Request() req: { user: AuthResponseDto },
  ): Promise<DisputeConstraintResponseDto> {
    return this.service.update(id, dto, req.user.id);
  }

  /**
   * DELETE /api/v1/dispute-constraints/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a dispute constraint and all its files' })
  @ApiParam({ name: 'id', description: 'Constraint UUID' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Dispute constraint not found.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}
