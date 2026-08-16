import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Readable } from 'stream';
import {
  AzureBlobService,
  BlobStream,
} from 'src/common/azure-blob/azure-blob.service';
import { AssessmentDocument } from './entities/assessment-document.entity';
import {
  DisputeCase,
  DisputeStatus,
} from '../dispute-cases/entities/dispute-case.entity';
import {
  AuditAction,
  AuditLog,
  SYSTEM_ACTOR_ID,
  SYSTEM_ACTOR_ROLE,
} from '../audit-log/entities/audit-log.entity';
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
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
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
        // Must be copied explicitly: create() whitelists fields, so omitting this here would
        // silently discard the type and the reports-uploaded gate could never fire.
        document_type: dto.document_type ?? null,
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

    // Only a document with a stored blob can satisfy the promotion guard, so there is nothing
    // to check when no file was supplied.
    if (doc.file_path && doc.dispute_case_id) {
      await this.tryPromoteToReportsUploaded(doc.dispute_case_id);
    }

    return this.toResponseDto(doc);
  }

  async createBatch(
    dtos: CreateAssessmentDocumentDto[],
  ): Promise<AssessmentDocumentResponseDto[]> {
    // No promotion pass of its own: create() already runs the check after each document that
    // lands a file, and the guarded UPDATE behind it is idempotent, so the last document to
    // complete the required set is the one that moves the case. A second per-case sweep here only
    // re-ran a query that could no longer match.
    return Promise.all(dtos.map((dto) => this.create(dto)));
  }

  /**
   * Advance a case that now has both required reports on file.
   *
   * Deliberately non-fatal: it runs after the documents are already committed (there is no
   * transaction around the upload), so a failure here must not turn a successful upload into a
   * 500 and lose the file the user just sent.
   *
   * Called from BOTH create() and createBatch(): uploading the second required report one file
   * at a time has to advance the case just as a batch does, or the case silently sits at
   * tnc_agreed with both reports visibly on file.
   */
  private async tryPromoteToReportsUploaded(caseId: string): Promise<void> {
    try {
      const moved =
        await this.repository.promoteToReportsUploadedIfComplete(caseId);
      // Zero rows affected is the normal outcome once a case has already advanced, so only a
      // real move is worth recording.
      if (moved) await this.recordReportsUploadedAudit(caseId);
    } catch (err) {
      this.logger.error(
        `[ASSESSMENT-DOCS] reports-uploaded check failed for case ${caseId}: ${String(err)}`,
      );
    }
  }

  /**
   * Records the system-driven move to `reports_uploaded`.
   *
   * Every other lifecycle step writes an audit row, and that trail is what
   * GET /dispute-cases/:id/audit serves to build a case timeline. This promotion is a raw
   * guarded UPDATE rather than a call into DisputeStatusTransitionService — injecting that
   * would be a circular module dependency — so it has to write its own row. Without it the
   * status changes but the step leaves no trace, and a timeline shows the case advancing with
   * no record of what advanced it.
   *
   * `from_status` is hardcoded because the guarded UPDATE only matches `tnc_agreed`; that is
   * the sole legal predecessor, so a row that moved came from there by construction.
   *
   * Non-fatal on purpose: the documents are already committed and the status has already
   * moved, so a failure here must not turn a successful upload into a 500.
   */
  private async recordReportsUploadedAudit(caseId: string): Promise<void> {
    try {
      await this.auditLogRepository.save(
        this.auditLogRepository.create({
          action: AuditAction.REPORTS_UPLOADED,
          performedBy: SYSTEM_ACTOR_ID,
          performedByRole: SYSTEM_ACTOR_ROLE,
          caseId,
          fromStatus: DisputeStatus.TNC_AGREED,
          toStatus: DisputeStatus.REPORTS_UPLOADED,
          notes: 'Required reports uploaded',
        }),
      );
    } catch (err) {
      this.logger.error(
        `[ASSESSMENT-DOCS] case ${caseId} moved to reports_uploaded but the audit row failed to write: ${String(err)}`,
      );
    }
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

    // Same check create() runs, and for the same reason. This is the ONLY way to classify a
    // document that already exists — every row predating the document_type column is NULL, and
    // AddDocumentTypeToAssessmentDocuments deliberately does not backfill. Without this, setting
    // the type on both required reports leaves the case at tnc_agreed with the gate satisfied,
    // and `analysed` is system-written too, so there is no manual way out short of an admin force.
    if (saved.file_path && saved.dispute_case_id) {
      await this.tryPromoteToReportsUploaded(saved.dispute_case_id);
    }

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
