import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssessmentDocumentsService } from './assessment-documents.service';
import { CreateAssessmentDocumentDto } from './dto/create-assessment-document.dto';
import { CreateAssessmentDocumentsBatchDto } from './dto/create-assessment-documents-batch.dto';
import { UpdateAssessmentDocumentDto } from './dto/update-assessment-document.dto';
import { AssessmentDocumentResponseDto } from './dto/assessment-document-response.dto';

@ApiTags('Assessment Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'assessment-documents', version: '1' })
export class AssessmentDocumentsController {
  private readonly logger = new Logger(AssessmentDocumentsController.name);

  constructor(
    private readonly assessmentDocumentsService: AssessmentDocumentsService,
  ) {}

  @Post('batch')
  @ApiOperation({
    summary: 'Create multiple assessment documents in one request',
  })
  @ApiResponse({ status: 201, type: [AssessmentDocumentResponseDto] })
  createBatch(
    @Body() dto: CreateAssessmentDocumentsBatchDto,
  ): Promise<AssessmentDocumentResponseDto[]> {
    return this.assessmentDocumentsService.createBatch(dto.documents);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new assessment document' })
  @ApiResponse({ status: 201, type: AssessmentDocumentResponseDto })
  create(
    @Body() dto: CreateAssessmentDocumentDto,
  ): Promise<AssessmentDocumentResponseDto> {
    return this.assessmentDocumentsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'List all assessment documents, optionally filtered by client or dispute case',
  })
  @ApiQuery({
    name: 'client_id',
    required: false,
    description: 'Filter by client UUID',
  })
  @ApiQuery({
    name: 'dispute_case_id',
    required: false,
    description:
      'Filter by dispute case UUID (takes precedence over client_id)',
  })
  @ApiResponse({ status: 200, type: [AssessmentDocumentResponseDto] })
  findAll(
    @Query('client_id', new ParseUUIDPipe({ optional: true }))
    clientId?: string,
    @Query('dispute_case_id', new ParseUUIDPipe({ optional: true }))
    disputeCaseId?: string,
  ): Promise<AssessmentDocumentResponseDto[]> {
    return this.assessmentDocumentsService.findAll(clientId, disputeCaseId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single assessment document by ID' })
  @ApiParam({ name: 'id', description: 'Assessment document UUID' })
  @ApiResponse({ status: 200, type: AssessmentDocumentResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssessmentDocumentResponseDto> {
    return this.assessmentDocumentsService.findOne(id);
  }

  /**
   * Streams the document bytes through the API rather than handing the browser a
   * SAS URL. The SAS URL is unusable from client-side `fetch` because the storage
   * account has no CORS rule for the app's origins, and reading the bytes in JS
   * is what the folder-picker download requires.
   */
  @Get(':id/content')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Stream a single assessment document as raw bytes',
    description:
      'Returns the document as an attachment. Always served with an explicit ' +
      'server-derived Content-Type and nosniff, since the stored bytes are user-supplied.',
  })
  @ApiParam({ name: 'id', description: 'Assessment document UUID' })
  @ApiResponse({ status: 200, description: 'Raw document bytes' })
  @ApiResponse({ status: 400, description: 'Malformed UUID' })
  @ApiResponse({
    status: 404,
    description: 'Document not found or has no stored file',
  })
  @ApiResponse({ status: 429, description: 'Too many download requests' })
  async getContent(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { stream, filename, contentType, contentLength } =
      await this.assessmentDocumentsService.getDocumentContent(id);

    const file = new StreamableFile(stream, {
      type: contentType,
      // Declaring Content-Length gives the browser a real progress bar, and makes
      // a transfer that ends early detectable by the client rather than arriving
      // as a complete-looking short file.
      length: contentLength,
      disposition: `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });

    // A blob stream can fail after headers are flushed — the handler promise has
    // already resolved 200 by then, so no exception filter can run. Nest's default
    // handler replies with the raw error message, which is the upstream-text leak
    // this codebase is trying to close, so replace it.
    file.setErrorLogger((error) =>
      this.logger.error(
        `Blob stream failed for assessment document ${id}`,
        error.stack,
      ),
    );
    file.setErrorHandler((_error, response) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      response.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      response.send('Internal server error');
    });

    return file;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an assessment document' })
  @ApiParam({ name: 'id', description: 'Assessment document UUID' })
  @ApiResponse({ status: 200, type: AssessmentDocumentResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssessmentDocumentDto,
  ): Promise<AssessmentDocumentResponseDto> {
    return this.assessmentDocumentsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an assessment document' })
  @ApiParam({ name: 'id', description: 'Assessment document UUID' })
  @ApiResponse({ status: 200, description: 'Deleted successfully' })
  @ApiResponse({ status: 404, description: 'Not found' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.assessmentDocumentsService.remove(id);
  }
}
