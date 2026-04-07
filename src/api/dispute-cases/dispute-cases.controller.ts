import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApprovalDocumentsResponseDto } from './dto/approval-documents-response.dto';
import { DisputeCasesService } from './dispute-cases.service';
import { UpdateDisputeCaseDto } from './dto/update-dispute-case.dto';
import { CreateDisputeIntakeDto } from './dto/create-dispute-intake.dto';
import { CloseNoObjectionDto } from './dto/close-no-objection.dto';
import { ApproveObjectionPackageDto } from './dto/approve-objection-package.dto';
import { DisputeCaseResponseDto } from './dto/dispute-case-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('dispute-cases')
@Controller({
  path: 'dispute-cases',
  version: '1',
})
export class DisputeCasesController {
  constructor(private readonly disputeCasesService: DisputeCasesService) {}

  /**
   * Submit a new dispute case via intake form
   * Accepts application/json with base64-encoded PDF
   */
  @ApiOperation({ summary: 'Submit a new dispute intake application', description: 'Creates a new dispute case with client, property, and legal grounds' })
  @ApiBody({ type: CreateDisputeIntakeDto })
  @ApiResponse({ status: 201, description: 'Dispute case successfully created' })
  @ApiResponse({ status: 400, description: 'Validation error — missing required fields or invalid base64 attachment' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @Post('intake/submit')
  async submitIntake(@Body() intakeDto: CreateDisputeIntakeDto): Promise<unknown> {
    return this.disputeCasesService.submitIntakeApplication(intakeDto);
  }

  @Post('approve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve an objection package via token',
    description:
      'Public endpoint called when the client submits their approval token. ' +
      'Validates the token, records approval, and clears the token. Idempotent on repeat calls.',
  })
  @ApiBody({ type: ApproveObjectionPackageDto })
  @ApiResponse({ status: 200, description: 'Package approved or already approved — { alreadyApproved: boolean, propertyAddress?: string }' })
  @ApiResponse({ status: 404, description: 'Token not found or invalid' })
  @ApiResponse({ status: 410, description: 'Token has expired' })
  approveObjectionPackage(
    @Body() dto: ApproveObjectionPackageDto,
  ): Promise<{ alreadyApproved: boolean; propertyAddress?: string }> {
    return this.disputeCasesService.approveObjectionPackage(dto.token);
  }

  @Get('approval-documents')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get objection package documents for client review',
    description: 'Public endpoint. Returns signed document view URLs for the given approval token. Used by the client-facing approval page before the client submits their approval.',
  })
  @ApiQuery({ name: 'token', required: true, description: 'Approval token UUID' })
  @ApiResponse({ status: 200, description: 'Document list returned', type: ApprovalDocumentsResponseDto })
  @ApiResponse({ status: 400, description: 'Missing or malformed token' })
  @ApiResponse({ status: 404, description: 'Token not found or invalid' })
  @ApiResponse({ status: 410, description: 'Token has expired' })
  getApprovalDocuments(@Query('token') token: string): Promise<ApprovalDocumentsResponseDto> {
    if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      throw new BadRequestException('Invalid or missing approval token');
    }
    return this.disputeCasesService.getApprovalDocuments(token);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'List all dispute cases' })
  @ApiResponse({ status: 200, description: 'List of dispute cases', type: [DisputeCaseResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  findAll(): Promise<DisputeCaseResponseDto[]> {
    return this.disputeCasesService.findAll();
  }

  // Public endpoint — no auth guard. Must be declared before @Get(':id') to avoid conflict.
  @Get('advisory-view/:id')
  @ApiOperation({ summary: 'Public advisory document view — returns case summary and 72-hr signed PDF URL' })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, description: 'Case summary and PDF URL' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  findAdvisoryView(@Param('id') id: string) {
    return this.disputeCasesService.findAdvisoryView(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single dispute case by ID' })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, description: 'Dispute case found', type: DisputeCaseResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  findOne(@Param('id') id: string): Promise<DisputeCaseResponseDto> {
    return this.disputeCasesService.findOne(id);
  }

  @Get(':id/report-url')
  @ApiOperation({ summary: 'Get dispute case report URL' })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, description: 'Case ID, reference, and signed report URL' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  getReportUrl(@Param('id') id: string) {
    return this.disputeCasesService.findReportUrl(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Update a dispute case' })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiBody({ type: UpdateDisputeCaseDto })
  @ApiResponse({ status: 200, description: 'Dispute case updated', type: DisputeCaseResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  update(@Param('id') id: string, @Body() updateDisputeCaseDto: UpdateDisputeCaseDto): Promise<DisputeCaseResponseDto> {
    return this.disputeCasesService.update(id, updateDisputeCaseDto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/advance-to-appraisal')
  @ApiOperation({ summary: 'Advance a dispute case to valuation appraisal' })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 201, description: 'Case advanced to appraisal', type: DisputeCaseResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  @ApiResponse({ status: 422, description: 'Fewer than 3 comparable sales exist' })
  advanceToAppraisal(@Param('id') id: string): Promise<DisputeCaseResponseDto> {
    return this.disputeCasesService.advanceToAppraisal(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/close-no-objection')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Close a dispute case with no objection',
    description:
      'Closes the dispute case when the internal assessment value is at or above the VG assessed value, ' +
      'indicating no viable objection grounds.',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiBody({ type: CloseNoObjectionDto })
  @ApiResponse({ status: 200, description: 'Case closed — no objection warranted', type: DisputeCaseResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 409, description: 'Case is already closed, or internal value is below VG value' })
  closeNoObjection(
    @Param('id') id: string,
    @Body() dto: CloseNoObjectionDto,
  ): Promise<DisputeCaseResponseDto> {
    return this.disputeCasesService.closeNoObjection(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/send-objection-package')
  @ApiOperation({
    summary: 'Send objection package approval email to the client',
    description:
      'Generates a time-limited approval token (30 days), dispatches an ACS email with an approval link, ' +
      'then stores the token on the dispute case and sets status to AWAITING_CLIENT_APPROVAL. ' +
      'Re-calling while status is PENDING will issue a fresh token and re-send the email. ' +
      'Returns 409 if the client has already approved the package.',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 201, description: 'Email dispatched — token stored on record', type: DisputeCaseResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  @ApiResponse({ status: 409, description: 'Package has already been approved by the client' })
  sendObjectionPackage(@Param('id') id: string): Promise<DisputeCaseResponseDto> {
    return this.disputeCasesService.sendObjectionPackage(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a dispute case' })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, description: 'Dispute case deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  remove(@Param('id') id: string): Promise<{ message: string }> {
    return this.disputeCasesService.remove(id);
  }
}
