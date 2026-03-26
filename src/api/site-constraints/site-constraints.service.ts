import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { SiteConstraint, ConstraintType } from './entities/site-constraints.entity';
import { SiteConstraintDocument } from './entities/site-constraint-document.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { DisputeDocument } from '../dispute-documents/entities/dispute-document.entity';
import { CreateSiteConstraintDto, UpdateSiteConstraintDto } from './dto/create-site-constraints.dto';
import { SiteConstraintResponseDto } from './dto/site-constraints-response.dto';
import { AzureBlobService } from '../../common/azure-blob/azure-blob.service';
import { REQUIRED_DOC_TYPES } from './constants/required-doc-types.constant';
import { DuplicateConstraintException } from './exceptions/duplicate-constraint.exception';

@Injectable()
export class SiteConstraintsService {
  private readonly logger = new Logger(SiteConstraintsService.name);

  private static readonly BLOB_FOLDER = 'dispute-cases';

  constructor(
    @InjectRepository(SiteConstraint)
    private readonly constraintRepo: Repository<SiteConstraint>,
    @InjectRepository(SiteConstraintDocument)
    private readonly constraintDocRepo: Repository<SiteConstraintDocument>,
    @InjectRepository(DisputeCase)
    private readonly disputeCaseRepo: Repository<DisputeCase>,
    @InjectRepository(DisputeDocument)
    private readonly disputeDocumentRepo: Repository<DisputeDocument>,
    private readonly azureBlobService: AzureBlobService,
  ) {}

  // ── CREATE ─────────────────────────────────────────────────────────────────

  async create(dto: CreateSiteConstraintDto, userId: string): Promise<SiteConstraintResponseDto> {
    const disputeCase = await this.assertDisputeCaseExists(dto.dispute_id);
    await this.assertNoDuplicateConstraint(dto.dispute_id, dto.constraint_type);

    const constraint = this.constraintRepo.create({
      dispute_id:      dto.dispute_id,
      constraint_type: dto.constraint_type,
      description:     dto.description   ?? null,
      legal_argument:  dto.legal_argument ?? null,
    });

    const saved = await this.constraintRepo.save(constraint);

    if (dto.attachments?.length) {
      await this.uploadAttachments(
        dto.attachments,
        saved.id,
        saved.constraint_type,
        disputeCase.case_reference,
      );
    }

    const withDocs = await this.loadWithDocuments(saved.id);

    this.logger.log(
      `[CONSTRAINT] Created — id=${saved.id} type=${saved.constraint_type} dispute=${saved.dispute_id} docs=${withDocs.documents.length} user=${userId} db_created_at=${saved.created_at.toISOString()}`,
    );

    this.runVerificationFlow(withDocs).catch((err: unknown) =>
      this.logger.error(
        `[CONSTRAINT] Verification flow error — id=${saved.id} type=${saved.constraint_type} dispute=${saved.dispute_id} error=${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    return this.toDto(withDocs);
  }

  // ── GET BY DISPUTE ─────────────────────────────────────────────────────────

  async findByDispute(disputeId: string): Promise<SiteConstraintResponseDto[]> {
    const exists = await this.disputeCaseRepo.existsBy({ id: disputeId });
    if (!exists) throw new NotFoundException(`Dispute case ${disputeId} not found.`);

    const results = await this.constraintRepo.find({
      where: { dispute_id: disputeId },
      relations: ['documents'],
      order: { created_at: 'ASC' },
    });

    return results.map((c) => this.toDto(c));
  }

  // ── GET ONE ────────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<SiteConstraintResponseDto> {
    const constraint = await this.loadWithDocuments(id);
    return this.toDto(constraint);
  }

  // ── GET DOCUMENT URLS ──────────────────────────────────────────────────────

  /**
   * Generates short-lived SAS URLs for all documents attached to a constraint.
   * URLs are produced fresh on every request and are never stored.
   * Returns an empty array when no documents have been uploaded.
   */
  async getDocumentUrls(id: string): Promise<Array<{ id: string; url: string }>> {
    const constraint = await this.loadWithDocuments(id);

    return constraint.documents.map((doc) => ({
      id:  doc.id,
      url: this.azureBlobService.getFileUrl(doc.blob_path) ?? '',
    }));
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateSiteConstraintDto): Promise<SiteConstraintResponseDto> {
    const constraint = await this.loadWithDocuments(id);

    const { attachments, attachment: _legacy, ...scalarFields } = dto as UpdateSiteConstraintDto & { attachment?: string };
    Object.assign(constraint, scalarFields);

    if (attachments?.length) {
      const disputeCase = await this.assertDisputeCaseExists(constraint.dispute_id);
      await this.uploadAttachments(
        attachments,
        constraint.id,
        constraint.constraint_type,
        disputeCase.case_reference,
      );
    }

    const saved = await this.constraintRepo.save(constraint);
    const withDocs = await this.loadWithDocuments(saved.id);

    if (withDocs.documents.length > 0) {
      await this.runVerificationFlow(withDocs);
    }

    return this.toDto(withDocs);
  }

  // ── REMOVE CONSTRAINT ──────────────────────────────────────────────────────

  async remove(id: string): Promise<void> {
    const constraint = await this.constraintRepo.findOne({ where: { id } });
    if (!constraint) throw new NotFoundException(`Site constraint ${id} not found.`);
    await this.constraintRepo.remove(constraint);
  }

  // ── REMOVE SINGLE DOCUMENT ─────────────────────────────────────────────────

  async removeDocument(constraintId: string, docId: string): Promise<void> {
    const doc = await this.constraintDocRepo.findOne({
      where: { id: docId, constraint_id: constraintId },
    });
    if (!doc) {
      throw new NotFoundException(`Document ${docId} not found on constraint ${constraintId}.`);
    }

    await this.azureBlobService.deleteFile(doc.blob_path).catch((err: unknown) =>
      this.logger.warn(
        `[CONSTRAINT] Blob delete failed — docId=${docId} blob=${doc.blob_path} error=${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    await this.constraintDocRepo.remove(doc);

    this.logger.log(
      `[CONSTRAINT] Document removed — constraintId=${constraintId} docId=${docId} blob=${doc.blob_path}`,
    );
  }

  // ── PRIVATE ────────────────────────────────────────────────────────────────

  private async loadWithDocuments(id: string): Promise<SiteConstraint> {
    const constraint = await this.constraintRepo.findOne({
      where: { id },
      relations: ['documents'],
    });
    if (!constraint) throw new NotFoundException(`Site constraint ${id} not found.`);
    return constraint;
  }

  private toDto(entity: SiteConstraint): SiteConstraintResponseDto {
    const dto = new SiteConstraintResponseDto();
    dto.id              = entity.id;
    dto.dispute_id      = entity.dispute_id;
    dto.constraint_type = entity.constraint_type;
    dto.description     = entity.description;
    dto.legal_argument  = entity.legal_argument;
    dto.document_count  = entity.documents?.length ?? 0;
    dto.has_document    = dto.document_count > 0;
    dto.created_at      = entity.created_at;
    return dto;
  }

  /**
   * Uploads multiple attachments and persists each as a SiteConstraintDocument row.
   * Each file gets a unique timestamped blob name to avoid collisions.
   */
  private async uploadAttachments(
    base64List: string[],
    constraintId: string,
    constraintType: ConstraintType,
    caseReference: string,
  ): Promise<void> {
    for (const [index, base64] of base64List.entries()) {
      const blobPath = await this.uploadSingleFile(base64, constraintType, caseReference, index);
      if (!blobPath) continue;

      const doc = this.constraintDocRepo.create({
        constraint_id: constraintId,
        blob_path:     blobPath,
      });
      await this.constraintDocRepo.save(doc);

      this.logger.log(
        `[CONSTRAINT] Document uploaded — constraintId=${constraintId} index=${index} blob=${blobPath}`,
      );
    }
  }

  /**
   * Uploads a single base64 file and returns the raw blob path for DB storage.
   * The SAS URL returned by AzureBlobService is intentionally discarded — we
   * reconstruct the same blobName locally and store only the path.
   */
  private async uploadSingleFile(
    base64: string,
    constraintType: ConstraintType,
    caseReference: string,
    index: number,
  ): Promise<string | null> {
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
    const fileName  = `constraints/${constraintType}__${timestamp}_${index}.pdf`;
    const blobPath  = `${SiteConstraintsService.BLOB_FOLDER}/${caseReference}/${fileName}`;

    await this.azureBlobService.uploadToAzureBlob(
      base64,
      caseReference,
      SiteConstraintsService.BLOB_FOLDER,
      fileName,
    );

    return blobPath;
  }

  private async assertDisputeCaseExists(disputeId: string): Promise<DisputeCase> {
    const disputeCase = await this.disputeCaseRepo.findOne({ where: { id: disputeId } });
    if (!disputeCase) throw new NotFoundException(`Dispute case ${disputeId} not found.`);
    return disputeCase;
  }

  private async assertNoDuplicateConstraint(
    disputeId: string,
    constraintType: ConstraintType,
  ): Promise<void> {
    const exists = await this.constraintRepo.existsBy({
      dispute_id:      disputeId,
      constraint_type: constraintType,
    });
    if (exists) throw new DuplicateConstraintException(constraintType, disputeId);
  }

  private async runVerificationFlow(constraint: SiteConstraint): Promise<void> {
    const hasDocuments = await this.hasRequiredDocuments(constraint);
    if (hasDocuments) {
      this.logger.log(
        `[CONSTRAINT] Supporting documents found — id=${constraint.id} type=${constraint.constraint_type} dispute=${constraint.dispute_id}`,
      );
    } else {
      this.logger.warn(
        `[CONSTRAINT] Missing supporting documents — id=${constraint.id} type=${constraint.constraint_type} dispute=${constraint.dispute_id}`,
      );
    }
  }

  private async hasRequiredDocuments(constraint: SiteConstraint): Promise<boolean> {
    if ((constraint.documents?.length ?? 0) > 0) return true;

    const requiredTypes = REQUIRED_DOC_TYPES[constraint.constraint_type] ?? [];
    if (requiredTypes.length === 0) return false;

    const count = await this.disputeDocumentRepo.count({
      where: {
        dispute_id:    constraint.dispute_id,
        document_type: In(requiredTypes),
      },
    });

    this.logger.debug(
      `[CONSTRAINT] Doc check — dispute=${constraint.dispute_id} type=${constraint.constraint_type} required=[${requiredTypes.join(', ')}] found=${count}`,
    );

    return count > 0;
  }
}
