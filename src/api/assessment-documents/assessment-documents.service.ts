import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Readable } from 'stream';
import {
  AzureBlobService,
  BlobStream,
} from 'src/common/azure-blob/azure-blob.service';
import { AssessmentDocument } from './entities/assessment-document.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { CreateAssessmentDocumentDto } from './dto/create-assessment-document.dto';
import { UpdateAssessmentDocumentDto } from './dto/update-assessment-document.dto';
import { AssessmentDocumentResponseDto } from './dto/assessment-document-response.dto';
import { AssessmentDocumentsRepository } from './assessment-documents.repository';
import { AssessmentDocumentNotFoundException } from './exceptions/assessment-document-not-found.exception';
import { AssessmentDocumentFileMissingException } from './exceptions/assessment-document-file-missing.exception';

const URL_EXPIRY_MINUTES = 30;
const FOLDER = 'assessment-documents';

/**
 * Allowlist of Content-Types the download endpoint will advertise, keyed by the
 * stored file extension. Deliberately an allowlist rather than a general MIME
 * lookup: the bytes are user-uploaded, and serving an unexpected type such as
 * text/html or image/svg+xml from our own origin would be stored XSS against a
 * cookie-authenticated session. Anything unrecognised is served as an opaque
 * download instead.
 */
const DOWNLOAD_CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  tiff: 'image/tiff',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

export interface AssessmentDocumentContent {
  stream: Readable;
  filename: string;
  contentType: string;
  contentLength?: number;
}

@Injectable()
export class AssessmentDocumentsService {
  private readonly logger = new Logger(AssessmentDocumentsService.name);

  constructor(
    @InjectRepository(AssessmentDocument)
    private readonly assessmentDocumentsRepository: Repository<AssessmentDocument>,
    @InjectRepository(DisputeCase)
    private readonly disputeCaseRepository: Repository<DisputeCase>,
    private readonly repository: AssessmentDocumentsRepository,
    private readonly azureBlobService: AzureBlobService,
  ) {}

  async create(
    dto: CreateAssessmentDocumentDto,
  ): Promise<AssessmentDocumentResponseDto> {
    const doc = await this.assessmentDocumentsRepository.save(
      this.assessmentDocumentsRepository.create({
        client_id: dto.client_id,
        dispute_case_id: dto.dispute_case_id,
        document_name: dto.document_name,
      }),
    );

    if (dto.file) {
      const ext = this.extractExtension(dto.file);
      const filePath = await this.azureBlobService.uploadToAzureBlob(
        dto.file,
        doc.id,
        FOLDER,
        `${dto.document_name}.${ext}`,
      );
      if (filePath) {
        doc.file_path = filePath;
        await this.assessmentDocumentsRepository.save(doc);
      }
    }

    return this.toResponseDto(doc);
  }

  async createBatch(
    dtos: CreateAssessmentDocumentDto[],
  ): Promise<AssessmentDocumentResponseDto[]> {
    return Promise.all(dtos.map((dto) => this.create(dto)));
  }

  async findAll(
    clientId?: string,
    disputeCaseId?: string,
  ): Promise<AssessmentDocumentResponseDto[]> {
    if (disputeCaseId) {
      const extraDocumentId =
        await this.resolveCaseSourceDocumentId(disputeCaseId);
      const docs = await this.findDocumentsForCase(
        disputeCaseId,
        extraDocumentId,
      );
      return docs.map((doc) => this.toResponseDto(doc));
    }

    const docs = await this.assessmentDocumentsRepository.find({
      where: clientId ? { client_id: clientId } : undefined,
      order: { created_at: 'DESC' },
      take: 200,
    });
    return docs.map((doc) => this.toResponseDto(doc));
  }

  async findOne(id: string): Promise<AssessmentDocumentResponseDto> {
    const doc = await this.assessmentDocumentsRepository.findOne({
      where: { id },
    });
    if (!doc)
      throw new NotFoundException(`AssessmentDocument #${id} not found`);
    return this.toResponseDto(doc);
  }

  async update(
    id: string,
    dto: UpdateAssessmentDocumentDto,
  ): Promise<AssessmentDocumentResponseDto> {
    const doc = await this.assessmentDocumentsRepository.findOne({
      where: { id },
    });
    if (!doc)
      throw new NotFoundException(`AssessmentDocument #${id} not found`);

    const { file, ...scalarFields } = dto;
    Object.assign(doc, scalarFields);

    if (file) {
      const ext = this.extractExtension(file);
      const name = dto.document_name ?? doc.document_name;
      const filePath = await this.azureBlobService.uploadToAzureBlob(
        file,
        doc.id,
        FOLDER,
        `${name}.${ext}`,
      );
      if (filePath) doc.file_path = filePath;
    }

    const saved = await this.assessmentDocumentsRepository.save(doc);
    return this.toResponseDto(saved);
  }

  async remove(id: string): Promise<{ message: string }> {
    const doc = await this.assessmentDocumentsRepository.findOne({
      where: { id },
    });
    if (!doc)
      throw new NotFoundException(`AssessmentDocument #${id} not found`);
    await this.assessmentDocumentsRepository.remove(doc);
    return { message: `AssessmentDocument #${id} removed` };
  }

  async createInitialRecord(
    clientId: string,
    documentName: string,
    disputeCaseId: string | null = null,
  ): Promise<AssessmentDocument> {
    return this.assessmentDocumentsRepository.save(
      this.assessmentDocumentsRepository.create({
        client_id: clientId,
        dispute_case_id: disputeCaseId,
        document_name: documentName,
        file_path: null,
      }),
    );
  }

  async updateFilePath(id: string, filePath: string): Promise<void> {
    await this.assessmentDocumentsRepository.update(id, {
      file_path: filePath,
    });
  }

  async createArtifactRecord(
    clientId: string,
    documentName: string,
    filePath: string,
    disputeCaseId: string,
  ): Promise<AssessmentDocument> {
    return this.assessmentDocumentsRepository.save(
      this.assessmentDocumentsRepository.create({
        client_id: clientId,
        dispute_case_id: disputeCaseId,
        document_name: documentName,
        file_path: filePath,
      }),
    );
  }

  async findForCase(
    disputeCaseId: string,
    extraDocumentId?: string | null,
  ): Promise<AssessmentDocument[]> {
    return this.findDocumentsForCase(disputeCaseId, extraDocumentId);
  }

  private async resolveCaseSourceDocumentId(
    disputeCaseId: string,
  ): Promise<string | null> {
    const disputeCase = await this.disputeCaseRepository.findOne({
      where: { id: disputeCaseId },
      relations: ['valuation_notice'],
    });
    return disputeCase?.valuation_notice?.source_document_id ?? null;
  }

  private async findDocumentsForCase(
    disputeCaseId: string,
    extraDocumentId?: string | null,
  ): Promise<AssessmentDocument[]> {
    const caseScoped = await this.assessmentDocumentsRepository.find({
      where: { dispute_case_id: disputeCaseId },
      order: { created_at: 'DESC' },
    });

    if (extraDocumentId && !caseScoped.some((d) => d.id === extraDocumentId)) {
      const extraDoc = await this.assessmentDocumentsRepository.findOne({
        where: { id: extraDocumentId },
      });
      if (extraDoc) return [...caseScoped, extraDoc];
    }

    return caseScoped;
  }

  /**
   * Resolves a document to a readable blob stream plus the metadata the caller
   * needs to build the HTTP response. Everything that can fail is resolved here,
   * before any header is written, so failures still reach the exception filters.
   */
  async getDocumentContent(id: string): Promise<AssessmentDocumentContent> {
    const doc = await this.repository.findByIdForDownload(id);
    if (!doc) throw new AssessmentDocumentNotFoundException(id);
    if (!doc.file_path) throw new AssessmentDocumentFileMissingException(id);

    const filename = this.buildFilename(doc)!;
    const contentType = this.resolveContentType(doc.file_path);

    let blob: BlobStream;
    try {
      blob = await this.azureBlobService.getFileStream(doc.file_path);
    } catch (error) {
      // Blob genuinely absent is a domain condition; anything else (expired
      // credential, throttle, outage) is infrastructure and must not be
      // reported as a 404 — rethrow and let AllExceptionsFilter emit a 500.
      this.logger.error(
        `Failed to open blob stream for assessment document ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      if (this.isNotFoundError(error)) {
        throw new AssessmentDocumentFileMissingException(id);
      }
      throw error;
    }

    this.logger.log(
      `Streaming assessment document ${id} as ${filename} (${blob.contentLength ?? 'unknown'} bytes)`,
    );
    return {
      stream: blob.stream,
      filename,
      contentType,
      contentLength: blob.contentLength,
    };
  }

  private resolveContentType(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
    return DOWNLOAD_CONTENT_TYPES[extension] ?? DEFAULT_CONTENT_TYPE;
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      (error as { statusCode?: number }).statusCode === 404
    );
  }

  private toResponseDto(
    doc: AssessmentDocument,
  ): AssessmentDocumentResponseDto {
    const filename = this.buildFilename(doc);
    const viewUrl = this.azureBlobService.getFileUrl(
      doc.file_path,
      URL_EXPIRY_MINUTES,
    );
    const downloadUrl = filename
      ? this.azureBlobService.getFileUrl(
          doc.file_path,
          URL_EXPIRY_MINUTES,
          `attachment; filename="${filename}"`,
        )
      : null;
    return AssessmentDocumentResponseDto.fromEntity(
      doc,
      viewUrl,
      downloadUrl,
      filename,
    );
  }

  /**
   * The name the document should be saved as. Derived from document_name rather
   * than the basename of file_path, because a PATCH rename updates the former
   * and not the latter, and document_name is what the UI displays.
   *
   * Sanitised for use in a Content-Disposition header: document_name is only
   * validated against '/' on the way in, so quotes and CR/LF can reach here —
   * a quote would truncate the header value and a newline makes Node throw
   * ERR_INVALID_CHAR.
   */
  private buildFilename(doc: AssessmentDocument): string | null {
    if (!doc.file_path) return null;

    const extension = doc.file_path.includes('.')
      ? `.${doc.file_path.split('.').pop()}`
      : '';
    const base = doc.document_name.replace(/[\\/:*?"<>|]/g, '_');

    // eslint-disable-next-line no-control-regex
    return `${base}${extension}`.replace(/[\x00-\x1f\x7f]/g, '').trim();
  }

  private extractExtension(base64: string): string {
    const match = base64.match(/^data:([^;]+);base64,/);
    if (!match) return 'pdf';
    const mimeMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/tiff': 'tiff',
    };
    return mimeMap[match[1]] ?? 'bin';
  }
}
