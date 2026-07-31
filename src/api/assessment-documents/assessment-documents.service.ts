import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { AssessmentDocument } from './entities/assessment-document.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { CreateAssessmentDocumentDto } from './dto/create-assessment-document.dto';
import { UpdateAssessmentDocumentDto } from './dto/update-assessment-document.dto';
import { AssessmentDocumentResponseDto } from './dto/assessment-document-response.dto';

const URL_EXPIRY_MINUTES = 30;
const FOLDER = 'assessment-documents';

@Injectable()
export class AssessmentDocumentsService {
  constructor(
    @InjectRepository(AssessmentDocument)
    private readonly assessmentDocumentsRepository: Repository<AssessmentDocument>,
    @InjectRepository(DisputeCase)
    private readonly disputeCaseRepository: Repository<DisputeCase>,
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

  /**
   * Idempotent variant of createArtifactRecord() for a pipeline artifact that gets REGENERATED for
   * the same case: one row per (dispute_case_id, document_name), with its file_path repointed at the
   * newest blob.
   *
   * createArtifactRecord() appends unconditionally, which is right for per-run evidence artefacts —
   * each screenshot and per-issue evidence PDF is a distinct document, and its returned id is wired
   * into that run's dispute_evidence_issues / dispute_objection_reasons rows — and wrong for a report
   * a user regenerates on demand: every press of the button would add another identical row to the
   * Documents tab, with nothing in the list telling the reader which one is current.
   *
   * Matched on document_name, not file_path: the blob path is deterministic
   * (analysis-reports/<caseId>/<name>.pdf) and uploadFile() overwrites in place, so the path is
   * identical across regenerations and cannot distinguish them.
   *
   * Not a DB-level upsert: assessment_documents has no unique index on
   * (dispute_case_id, document_name), and adding one would fail against the duplicate rows this
   * method exists to stop creating. Two genuinely concurrent regenerations could therefore still both
   * insert — cosmetic rather than wrong, since both write the same name and the same path, and every
   * caller is already serialised (one click at a time; the report queue runs at concurrency 1).
   *
   * created_at ASC so a case that already carries duplicates converges on the OLDEST row instead of
   * ping-ponging between them, and update() rather than save() so that created_at survives:
   * findDocumentsForCase orders created_at DESC, and bumping it would reshuffle the Documents tab on
   * every regeneration.
   */
  async upsertArtifactRecord(
    clientId: string,
    documentName: string,
    filePath: string,
    disputeCaseId: string,
  ): Promise<AssessmentDocument> {
    const existing = await this.assessmentDocumentsRepository.findOne({
      where: { dispute_case_id: disputeCaseId, document_name: documentName },
      order: { created_at: 'ASC' },
    });

    if (!existing) {
      return this.createArtifactRecord(clientId, documentName, filePath, disputeCaseId);
    }

    await this.assessmentDocumentsRepository.update(existing.id, { file_path: filePath });
    return { ...existing, file_path: filePath };
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

  private toResponseDto(
    doc: AssessmentDocument,
  ): AssessmentDocumentResponseDto {
    const viewUrl = this.azureBlobService.getFileUrl(
      doc.file_path,
      URL_EXPIRY_MINUTES,
    );
    const downloadUrl = doc.file_path
      ? this.azureBlobService.getFileUrl(
          doc.file_path,
          URL_EXPIRY_MINUTES,
          `attachment; filename="${doc.document_name}.${doc.file_path.split('.').pop()}"`,
        )
      : null;
    return AssessmentDocumentResponseDto.fromEntity(doc, viewUrl, downloadUrl);
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
