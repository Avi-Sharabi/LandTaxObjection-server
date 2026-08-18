import {
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
  Version,
  ParseUUIDPipe,
  Req,
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
import { DisputeCasesService } from './dispute-cases.service';
import { GetDisputeCasesQueryDto } from '../../common/dto/paginated-query.dto';
import { PaginatedDisputeCasesResponseDto } from '../../common/dto/paginated-response.dto';
import { UpdateDisputeCaseDto } from './dto/update-dispute-case.dto';
import { CreateDisputeIntakeDto } from './dto/create-dispute-intake.dto';
import { CreateDisputeIntakeV2Dto } from './dto/create-dispute-intake-v2.dto';
import {
  ExtractValuationNoticeDto,
  ValuationNoticeExtractionDto,
} from './dto/extract-valuation-notice.dto';
import { DisputeCaseResponseDto } from './dto/dispute-case-response.dto';
import { AnalysisReportResponseDto } from './dto/analysis-report-response.dto';
import { LandTaxResponseDto } from '../valuation/dto/land-tax-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { VGResponseMonitorScheduler } from './vg-response-monitor.scheduler';
import { SupportingEvidenceQueueService } from '../supporting-evidence/supporting-evidence-queue.service';
import { EvidenceIssueResponseDto } from '../supporting-evidence/dto/evidence-issue-response.dto';
import { AnalyzeAiQueueService } from './analyze-ai-queue.service';
import { ObjectionReasonGeneratorService } from './objection-reason-generator.service';
import { ObjectionReasonResponseDto } from './dto/objection-reason-response.dto';
import {
  AnalyzeAiEnqueueResponseDto,
  AnalyzeAiQueueResponseDto,
  AnalyzeAiStatusResponseDto,
  BatchAnalyzeAiRequestDto,
  BatchAnalyzeAiResponseDto,
} from './dto/analyze-ai-response.dto';
import {
  BulkDeleteDisputeCasesDto,
  BulkDeleteDisputeCasesResponseDto,
} from './dto/bulk-delete-cases.dto';
import { DisputeStatusOptionDto } from './dto/dispute-status-option.dto';
import { CaseAuditEntryDto } from './dto/case-audit-entry.dto';
import { disputeStatusOptions } from './dispute-status';
import { UpdateDisputeCaseStatusDto } from './dto/update-dispute-case-status.dto';
import {
  DisputeCaseStatusTransitionResponseDto,
  DisputeCaseTransitionsResponseDto,
} from './dto/dispute-case-status-transition-response.dto';
import { DisputeStatusTransitionService } from './dispute-status-transition.service';
import { ValuationReportService } from './valuation-report.service';

@ApiTags('dispute-cases')
@Controller({
  path: 'dispute-cases',
  version: '1',
})
export class DisputeCasesController {
  constructor(
    private readonly disputeCasesService: DisputeCasesService,
    private readonly vgResponseMonitorScheduler: VGResponseMonitorScheduler,
    private readonly analyzeAiQueueService: AnalyzeAiQueueService,
    private readonly supportingEvidenceQueueService: SupportingEvidenceQueueService,
    private readonly objectionReasonGeneratorService: ObjectionReasonGeneratorService,
    private readonly valuationReportService: ValuationReportService,
    private readonly statusTransitionService: DisputeStatusTransitionService,
  ) {}

  /**
   * Submit a new dispute case via intake form
   * Accepts application/json with base64-encoded PDF
   */
  @ApiOperation({
    summary: 'Submit a new dispute intake application',
    description:
      'Creates a new dispute case with client, property, and legal grounds',
  })
  @ApiBody({ type: CreateDisputeIntakeDto })
  @ApiResponse({
    status: 201,
    description: 'Dispute case successfully created',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error — missing required fields or invalid base64 attachment',
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  // Public endpoint — no auth guard. New client intake submitted before an account exists.
  @Post('intake/submit')
  async submitIntake(
    @Body() intakeDto: CreateDisputeIntakeDto,
  ): Promise<unknown> {
    return this.disputeCasesService.submitIntakeApplication(intakeDto);
  }

  /**
   * v2 — simplified intake: accountantId is optional, legal grounds not required at submission
   * Used by the new single-step SubmitDisputePage frontend
   */
  // Public endpoint — no auth guard. Simplified intake; client has no account at this stage.
  @Version('2')
  @Post('intake/submit')
  @ApiOperation({
    summary: 'Submit a new dispute intake application (v2)',
    description:
      'Simplified intake — no legal grounds or YML contact required at submission time',
  })
  @ApiBody({ type: CreateDisputeIntakeV2Dto })
  @ApiResponse({
    status: 201,
    description: 'Dispute case successfully created',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async submitIntakeV2(
    @Body() intakeDto: CreateDisputeIntakeV2Dto,
  ): Promise<unknown> {
    return this.disputeCasesService.submitIntakeApplication(intakeDto);
  }

  /**
   * Extract structured data (issue date, tax year, properties) from an uploaded
   * valuation notice PDF using Claude, to prefill the intake form before submission.
   */
  @ApiOperation({
    summary:
      'Extract structured data from an uploaded valuation notice PDF using AI',
    description:
      'Reads the attached PDF and returns issueDate, taxYear, and properties to prefill the intake form',
  })
  @ApiBody({ type: ExtractValuationNoticeDto })
  @ApiResponse({
    status: 201,
    description: 'Document parsed successfully',
    type: ValuationNoticeExtractionDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error — missing or invalid base64 attachment',
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  // Public endpoint — no auth guard. Called before intake submission, before any account exists.
  @Post('intake/extract')
  async extractValuationNotice(
    @Body() dto: ExtractValuationNoticeDto,
  ): Promise<ValuationNoticeExtractionDto> {
    return this.disputeCasesService.extractValuationNoticeDocument(
      dto.attachment,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'List all dispute cases' })
  @ApiQuery({
    name: 'clientId',
    required: false,
    description: 'Filter by client UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'List of dispute cases',
    type: [DisputeCaseResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  findAll(
    @Query('clientId', new ParseUUIDPipe({ optional: true })) clientId?: string,
  ): Promise<DisputeCaseResponseDto[]> {
    return this.disputeCasesService.findAll(clientId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('paginated')
  @ApiOperation({
    summary: 'List dispute cases with pagination, search, and filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of dispute cases',
    type: PaginatedDisputeCasesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  findPaginated(
    @Query() query: GetDisputeCasesQueryDto,
  ): Promise<PaginatedDisputeCasesResponseDto> {
    return this.disputeCasesService.findPaginated(query);
  }

  // Public endpoint — no auth guard. Accessed via time-limited token link in the advisory letter email.
  @Get('advisory-view')
  @ApiOperation({
    summary:
      'Public advisory document view — validates token and returns case summary with a signed PDF URL',
    description:
      'Token is single-use per link and expires 72 hours after the case is closed.',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Advisory view token UUID from the email link',
  })
  @ApiResponse({
    status: 200,
    description: 'Case summary and signed report URL',
    type: AnalysisReportResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Token not found or invalid' })
  @ApiResponse({ status: 410, description: 'Token has expired' })
  findAdvisoryView(
    @Query('token') token: string,
  ): Promise<AnalysisReportResponseDto> {
    return this.disputeCasesService.findAdvisoryView(token);
  }

  // Declared before @Get(':id') — otherwise the :id route captures "statuses".
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('statuses')
  @ApiOperation({
    summary: 'List the dispute case status vocabulary',
    description:
      'Canonical status values with their display labels, in lifecycle order. Intended as the ' +
      'single source for the dashboard status column and status filter, so clients do not ' +
      'maintain their own copy of the list.',
  })
  @ApiResponse({
    status: 200,
    description: 'Status vocabulary in lifecycle order',
    type: [DisputeStatusOptionDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  findStatuses(): DisputeStatusOptionDto[] {
    return disputeStatusOptions();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single dispute case by ID' })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({
    status: 200,
    description: 'Dispute case found',
    type: DisputeCaseResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  findOne(@Param('id') id: string): Promise<DisputeCaseResponseDto> {
    return this.disputeCasesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/no-objection-report-url')
  @ApiOperation({
    summary: 'Get signed URL for the no-objection analysis report',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({
    status: 200,
    description: 'Case ID, reference, and signed report URL',
    type: AnalysisReportResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  getNoObjectionReportUrl(
    @Param('id') id: string,
  ): Promise<AnalysisReportResponseDto> {
    return this.disputeCasesService.findNoObjectionReportUrl(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Update a dispute case' })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiBody({ type: UpdateDisputeCaseDto })
  @ApiResponse({
    status: 200,
    description: 'Dispute case updated',
    type: DisputeCaseResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  update(
    @Param('id') id: string,
    @Body() updateDisputeCaseDto: UpdateDisputeCaseDto,
  ): Promise<DisputeCaseResponseDto> {
    return this.disputeCasesService.update(id, updateDisputeCaseDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ACCOUNTANT, UserRole.INTERNAL_Assessor)
  @ApiBearerAuth()
  @Patch(':id/status')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Move a dispute case to a new lifecycle status',
    description:
      'The single manual transition endpoint. The move is validated against the transition table ' +
      'in dispute-status.ts, the side effects that transition owns run in one transaction, and an ' +
      'audit row records who moved it from what to what. Re-sending the current status is a 200 ' +
      'no-op (changed:false) with no side effects and no audit row. ' +
      'Replaces POST /:id/submit-to-vg, /:id/close-no-objection and /:id/advance-to-appraisal. ' +
      'Statuses set by the system — created, reports_uploaded and analysed — are rejected here.',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiBody({ type: UpdateDisputeCaseStatusDto })
  @ApiResponse({
    status: 200,
    description:
      'Transition applied (or a no-op if the case was already on that status)',
    type: DisputeCaseStatusTransitionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'A system-written target status without force:true, a payload object that does not belong ' +
      'to this target, or a forced transition with no notes',
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({
    status: 403,
    description: 'This role may not use the force override (admin only)',
  })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  @ApiResponse({
    status: 409,
    description:
      'The case is already lodged, it has not been lodged when the transition requires it, the ' +
      'further-submission cap is reached, the case has no assessed land value to check against, ' +
      'or the internal assessment value is below the VG assessed value',
  })
  @ApiResponse({
    status: 422,
    description:
      'The transition is not legal from the current status, or an advisory close was requested ' +
      'for a client with no email address',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDisputeCaseStatusDto,
    @Req() req: { user: { id: string; fullName: string; role: UserRole } },
  ): Promise<DisputeCaseStatusTransitionResponseDto> {
    return this.statusTransitionService.applyManual(id, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/transitions')
  @ApiOperation({
    summary: 'List the status transitions currently available for a case',
    description:
      'Drives the case action menu. Clients should read this rather than hardcoding which action ' +
      'appears at which status — the lifecycle graph lives on the server. When `allowed` is empty ' +
      'because the case is waiting on a system-written status, `blockers` says what is missing.',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({
    status: 200,
    description: 'Current status plus the manual transitions legal from it',
    type: DisputeCaseTransitionsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  findTransitions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DisputeCaseTransitionsResponseDto> {
    return this.statusTransitionService.listTransitions(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/audit')
  @ApiOperation({
    summary: "Read a case's history",
    description:
      'The audit rows every lifecycle event already writes, oldest first. Read this to build a ' +
      'case timeline: the `*_at` columns on the case cover only some of the lifecycle, so a ' +
      'timeline assembled from them silently omits reports_uploaded, analysed, and the ' +
      'recording of a VG response — none of which stamp a column.',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({
    status: 200,
    description: 'Audit entries for the case, ascending by created_at',
    type: [CaseAuditEntryDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  async findAuditTrail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CaseAuditEntryDto[]> {
    return this.disputeCasesService.findAuditTrail(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/calculate-tax')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Compute land tax saved and profit for a dispute case',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, type: LandTaxResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Missing required data or unsupported tax year',
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  calculateTax(@Param('id') id: string): Promise<LandTaxResponseDto> {
    return this.disputeCasesService.calculateTax(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Post('internal/run-vg-follow-up')
  @HttpCode(200)
  @ApiOperation({
    summary: '[Internal] Manually trigger the VG follow-up scheduler',
    description:
      'Runs the same logic as the nightly cron job. Use in test/staging to verify follow-up emails and audit entries without waiting for the schedule.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Run complete — returns counts of cases checked, emails sent, and failures',
    schema: {
      example: { checked: 2, sent: 2, failed: 0 },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  runVGFollowUp(): Promise<{ checked: number; sent: number; failed: number }> {
    return this.vgResponseMonitorScheduler.runVGFollowUpCheck();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/evidence-issues')
  @ApiOperation({
    summary: 'Get evidence issues for a dispute case (latest run)',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, type: [EvidenceIssueResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  getEvidenceIssues(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EvidenceIssueResponseDto[]> {
    return this.supportingEvidenceQueueService.getIssuesByDisputeCase(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/objection-reasons')
  @ApiOperation({
    summary: 'Get objection reasons for a dispute case (latest run)',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, type: [ObjectionReasonResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  async getObjectionReasons(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ObjectionReasonResponseDto[]> {
    return this.objectionReasonGeneratorService.getObjectionReasons(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('analyze-ai/batch')
  @ApiOperation({
    summary: 'Batch trigger AI analysis for multiple cases (sequential)',
    description:
      'Enqueues an AI analysis job for each supplied case ID, in order. Jobs are processed one at a time — each case waits for the previous to finish before starting.',
  })
  @ApiBody({ type: BatchAnalyzeAiRequestDto })
  @ApiResponse({ status: 201, type: BatchAnalyzeAiResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  async analyzeAiBatch(
    @Body() dto: BatchAnalyzeAiRequestDto,
    @Req() req: { user: { id: string } },
  ): Promise<BatchAnalyzeAiResponseDto> {
    return this.analyzeAiQueueService.batchEnqueue(dto.caseIds, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/analyze-ai')
  @ApiOperation({
    summary: 'Trigger AI analysis — comparable sales + supporting evidence',
    description:
      'Enqueues the combined analysis job and returns its job ID. Poll GET /:id/analyze-ai/status to track progress.',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 201, type: AnalyzeAiEnqueueResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  @ApiResponse({
    status: 409,
    description: 'A job for this case is already waiting or active',
  })
  async analyzeAi(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { id: string } },
  ): Promise<AnalyzeAiEnqueueResponseDto> {
    const address =
      await this.disputeCasesService.getPropertyAddressForCase(id);
    return this.analyzeAiQueueService.enqueue(id, address, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('analyze-ai/queue')
  @ApiOperation({ summary: 'List all waiting and active AI analysis jobs' })
  @ApiResponse({ status: 200, type: AnalyzeAiQueueResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  async analyzeAiQueue(): Promise<AnalyzeAiQueueResponseDto> {
    const jobs = await this.analyzeAiQueueService.getQueueSnapshot();
    return { jobs, total: jobs.length };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/analyze-ai/status')
  @ApiOperation({ summary: 'Get AI analysis job status' })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, type: AnalyzeAiStatusResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({
    status: 404,
    description: 'Job not found for this dispute case',
  })
  async analyzeAiStatus(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AnalyzeAiStatusResponseDto> {
    return this.analyzeAiQueueService.getJobStatus(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INTERNAL_Assessor)
  @ApiBearerAuth()
  @Post(':id/regenerate-valuation-report')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Regenerate valuation report (dev shortcut)',
    description:
      'Skips the full pipeline and regenerates only the valuation report PDF from DB data. Works any time after the analyze-ai pipeline has run at least once for this case.',
  })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, description: 'Report regenerated successfully' })
  async regenerateValuationReport(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ status: string }> {
    await this.valuationReportService.generate(id);
    return { status: 'ok' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ACCOUNTANT)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a dispute case' })
  @ApiParam({ name: 'id', description: 'Dispute case UUID' })
  @ApiResponse({ status: 200, description: 'Dispute case deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — accountant or admin role required',
  })
  @ApiResponse({ status: 404, description: 'Dispute case not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { id: string } },
  ): Promise<{ message: string }> {
    return this.disputeCasesService.remove(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ACCOUNTANT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Soft-delete multiple dispute cases in one request',
  })
  @ApiResponse({ status: 200, type: BulkDeleteDisputeCasesResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — accountant or admin role required',
  })
  @Post('batch-delete')
  removeMany(
    @Body() dto: BulkDeleteDisputeCasesDto,
    @Req() req: { user: { id: string } },
  ): Promise<BulkDeleteDisputeCasesResponseDto> {
    return this.disputeCasesService.removeMany(dto.caseIds, req.user.id);
  }
}
