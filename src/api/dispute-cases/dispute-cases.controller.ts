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
  Req,
  Version,
  ParseUUIDPipe,
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
import { VgEmailMonitorTask } from './vg-email-monitor.task';
import { GetDisputeCasesQueryDto } from '../../common/dto/paginated-query.dto';
import { PaginatedDisputeCasesResponseDto } from '../../common/dto/paginated-response.dto';
import { UpdateDisputeCaseDto } from './dto/update-dispute-case.dto';
import { CreateDisputeIntakeDto } from './dto/create-dispute-intake.dto';
import { CreateDisputeIntakeV2Dto } from './dto/create-dispute-intake-v2.dto';
import { CloseNoObjectionDto } from './dto/close-no-objection.dto';
import { SubmitToVgDto } from './dto/submit-to-vg.dto';
import { RecordVgResponseDto } from './dto/record-vg-response.dto';
import { ApproveObjectionPackageDto } from './dto/approve-objection-package.dto';
import { DisputeCaseResponseDto } from './dto/dispute-case-response.dto';
import { AnalysisReportResponseDto } from './dto/analysis-report-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('dispute-cases')
@Controller({
  path: 'dispute-cases',
  version: '1',
})
export class DisputeCasesController {
  constructor(
    private readonly disputeCasesService: DisputeCasesService,
    private readonly vgEmailMonitorTask: VgEmailMonitorTask,
  ) {}

  // DEV ONLY — not guarded, remove before production
  @Post('dev/trigger-vg-poll')
  @HttpCode(200)
  @ApiOperation({ summary: '[DEV] Manually trigger the VG mailbox poll', description: 'Fires pollVgMailbox() immediately. Use this to test email detection without waiting for the daily cron.' })
  @ApiResponse({ status: 200, description: 'Poll triggered — check server logs and vg_email_inbox table for results' })
  async devTriggerVgPoll(): Promise<{ message: string }> {
    await this.vgEmailMonitorTask.pollVgMailbox();
    return { message: 'VG mailbox poll complete — check server logs' };
  }


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

  /**
   * v2 — simplified intake: accountantId is optional, legal grounds not required at submission
   * Used by the new single-step SubmitDisputePage frontend
   */
  @Version('2')
  @Post('intake/submit')
  @ApiOperation({ summary: 'Submit a new dispute intake application (v2)', description: 'Simplified intake — no legal grounds or YML contact required at submission time' })
  @ApiBody({ type: CreateDisputeIntakeV2Dto })
  @ApiResponse({ status: 201, description: 'Dispute case successfully created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async submitIntakeV2(@Body() intakeDto: CreateDisputeIntakeV2Dto): Promise<unknown> {
    return this.disputeCasesService.submitIntakeApplication(intakeDto as unknown as CreateDisputeIntakeDto);
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
  @ApiQuery({ name: 'clientId', required: false, description: 'Filter by client UUID' })
  @ApiResponse({ status: 200, description: 'List of dispute cases', type: [DisputeCaseResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  findAll(@Query('clientId', new ParseUUIDPipe({ optional: true })) clientId?: string): Promise<DisputeCaseResponseDto[]> {
    return this.disputeCasesService.findAll(clientId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('paginated')
  @ApiOperation({ summary: 'List dispute cases with pagination, search, and filtering' })
  @ApiResponse({ status: 200, description: 'Paginated list of dispute cases', type: PaginatedDisputeCasesResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  findPaginated(@Query() query: GetDisputeCasesQueryDto): Promise<PaginatedDisputeCasesResponseDto> {
    return this.disputeCasesService.findPaginated(query);
  }

  // Public endpoint — no auth guard. Accessed via time-limited token link in the advisory letter email.
  @Get('advisory-view')
  @ApiOperation({
    summary: 'Public advisory document view — validates token and returns case summary with a signed PDF URL',
    description: 'Token is single-use per link and expires 72 hours after the case is closed.',
  })
  @ApiQuery({ name: 'token', required: true, description: 'Advisory view token UUID from the email link' })
  @ApiResponse({ status: 200, description: 'Case summary and signed report URL', type: AnalysisReportResponseDto })
  @ApiResponse({ status: 404, description: 'Token not found or invalid' })
  @ApiResponse({ status: 410, description: 'Token has expired' })
  findAdvisoryView(@Query('token') token: string): Promise<AnalysisReportResponseDto> {
    return this.disputeCasesService.findAdvisoryView(token);
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/no-objection-report-url')
  @ApiOperation({ summary: 'Get signed URL for the no-objection analysis report' })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, description: 'Case ID, reference, and signed report URL', type: AnalysisReportResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  getNoObjectionReportUrl(@Param('id') id: string): Promise<AnalysisReportResponseDto> {
    return this.disputeCasesService.findNoObjectionReportUrl(id);
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
  @ApiResponse({ status: 422, description: 'Client has no email address on record' })
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INTERNAL_Assessor)
  @ApiBearerAuth()
  @Post(':id/submit-to-vg')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit an approved objection package to the Valuer-General',
    description:
      'Sets status to SUBMITTED_TO_VG, generates a lodgment reference number, records the submission timestamp, ' +
      'and sends a notification email. Returns 409 if already submitted or client approval is missing.',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiBody({ type: SubmitToVgDto })
  @ApiResponse({ status: 200, description: 'Case submitted to VG', type: DisputeCaseResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — Internal Assessor role required' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  @ApiResponse({ status: 409, description: 'Already submitted or client approval missing' })
  submitToVg(
    @Param('id') id: string,
    @Body() dto: SubmitToVgDto,
  ): Promise<DisputeCaseResponseDto> {
    return this.disputeCasesService.submitToVg(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ACCOUNTANT, UserRole.ADMIN)
  @ApiBearerAuth()
  @Post(':id/record-vg-response')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Record the VG response for a submitted dispute case',
    description:
      'Sets status to VG_RESPONSE_RECEIVED, records the response date, and writes an immutable audit log entry. ' +
      'Returns 409 if a response has already been recorded.',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiBody({ type: RecordVgResponseDto })
  @ApiResponse({ status: 200, description: 'VG response recorded', type: DisputeCaseResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — Internal Assessor role required' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  @ApiResponse({ status: 409, description: 'VG response already recorded' })
  recordVgResponse(
    @Param('id') id: string,
    @Body() dto: RecordVgResponseDto,
    @Req() req: { user: { id: string } },
  ): Promise<DisputeCaseResponseDto> {
    return this.disputeCasesService.recordVgResponse(id, dto, req.user.id);
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
