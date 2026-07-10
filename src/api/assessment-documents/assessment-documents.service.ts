import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { AssessmentDocument } from './entities/assessment-document.entity';
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
    private readonly azureBlobService: AzureBlobService,
  ) {}

  async create(dto: CreateAssessmentDocumentDto): Promise<AssessmentDocumentResponseDto> {
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

  async createBatch(dtos: CreateAssessmentDocumentDto[]): Promise<AssessmentDocumentResponseDto[]> {
    return Promise.all(dtos.map((dto) => this.create(dto)));
  }

  async findAll(clientId?: string): Promise<AssessmentDocumentResponseDto[]> {
    const docs = await this.assessmentDocumentsRepository.find({
      where: clientId ? { client_id: clientId } : undefined,
      order: { created_at: 'DESC' },
      take: 200,
    });
    return docs.map((doc) => this.toResponseDto(doc));
  }

  async findOne(id: string): Promise<AssessmentDocumentResponseDto> {
    const doc = await this.assessmentDocumentsRepository.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`AssessmentDocument #${id} not found`);
    return this.toResponseDto(doc);
  }

  async update(id: string, dto: UpdateAssessmentDocumentDto): Promise<AssessmentDocumentResponseDto> {
    const doc = await this.assessmentDocumentsRepository.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`AssessmentDocument #${id} not found`);

    const { file, ...scalarFields } = dto;
    Object.assign(doc, scalarFields);

    if (file) {
      const ext = this.extractExtension(file);
      const name = dto.document_name ?? doc.document_name;
      const filePath = await this.azureBlobService.uploadToAzureBlob(file, doc.id, FOLDER, `${name}.${ext}`);
      if (filePath) doc.file_path = filePath;
    }

    const saved = await this.assessmentDocumentsRepository.save(doc);
    return this.toResponseDto(saved);
  }

  async remove(id: string): Promise<{ message: string }> {
    const doc = await this.assessmentDocumentsRepository.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`AssessmentDocument #${id} not found`);
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
    await this.assessmentDocumentsRepository.update(id, { file_path: filePath });
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

  async findByClientId(clientId: string): Promise<AssessmentDocument[]> {
    return this.assessmentDocumentsRepository.find({
      where: { client_id: clientId },
      order: { created_at: 'DESC' },
    });
  }

  async findForCase(
    disputeCaseId: string,
    clientId: string,
    extraDocumentId?: string | null,
  ): Promise<AssessmentDocument[]> {
    const caseScoped = await this.assessmentDocumentsRepository.find({
      where: { dispute_case_id: disputeCaseId },
      order: { created_at: 'DESC' },
    });

    let result = caseScoped;
    if (extraDocumentId && !caseScoped.some((d) => d.id === extraDocumentId)) {
      const extraDoc = await this.assessmentDocumentsRepository.findOne({ where: { id: extraDocumentId } });
      if (extraDoc) result = [...caseScoped, extraDoc];
    }

    return result.length > 0 ? result : this.findByClientId(clientId);
  }

  private toResponseDto(doc: AssessmentDocument): AssessmentDocumentResponseDto {
    const viewUrl = this.azureBlobService.getFileUrl(doc.file_path, URL_EXPIRY_MINUTES);
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
