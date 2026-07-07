import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
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
  constructor(private readonly assessmentDocumentsService: AssessmentDocumentsService) {}

  @Post('batch')
  @ApiOperation({ summary: 'Create multiple assessment documents in one request' })
  @ApiResponse({ status: 201, type: [AssessmentDocumentResponseDto] })
  createBatch(
    @Body() dto: CreateAssessmentDocumentsBatchDto,
    @Req() req: { user: { id: string } },
  ): Promise<AssessmentDocumentResponseDto[]> {
    return this.assessmentDocumentsService.createBatch(dto.documents, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new assessment document' })
  @ApiResponse({ status: 201, type: AssessmentDocumentResponseDto })
  create(
    @Body() dto: CreateAssessmentDocumentDto,
    @Req() req: { user: { id: string } },
  ): Promise<AssessmentDocumentResponseDto> {
    return this.assessmentDocumentsService.create(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List all assessment documents, optionally filtered by client' })
  @ApiQuery({ name: 'client_id', required: false, description: 'Filter by client UUID' })
  @ApiResponse({ status: 200, type: [AssessmentDocumentResponseDto] })
  findAll(@Query('client_id', new ParseUUIDPipe({ optional: true })) clientId?: string): Promise<AssessmentDocumentResponseDto[]> {
    return this.assessmentDocumentsService.findAll(clientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single assessment document by ID' })
  @ApiParam({ name: 'id', description: 'Assessment document UUID' })
  @ApiResponse({ status: 200, type: AssessmentDocumentResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AssessmentDocumentResponseDto> {
    return this.assessmentDocumentsService.findOne(id);
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
