import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { SiteConstraint, ConstraintType } from './entities/site-constraints.entity';
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

    if (dto.attachment) {
      constraint.document_blob_url = await this.uploadAttachment(
        dto.attachment,
        dto.constraint_type,
        disputeCase.case_reference,
      );
    }

    const saved = await this.constraintRepo.save(constraint);

    this.logger.log(
      `[CONSTRAINT] Created — id=${saved.id} type=${saved.constraint_type} dispute=${saved.dispute_id} user=${userId} db_created_at=${saved.created_at.toISOString()}`,
    );

    this.runVerificationFlow(saved).catch((err: unknown) =>
      this.logger.error(
        `[CONSTRAINT] Verification flow error — id=${saved.id} type=${saved.constraint_type} dispute=${saved.dispute_id} error=${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    return this.toDto(saved);
  }

  // ── GET BY DISPUTE ─────────────────────────────────────────────────────────

  async findByDispute(disputeId: string): Promise<SiteConstraintResponseDto[]> {
    const exists = await this.disputeCaseRepo.existsBy({ id: disputeId });
    if (!exists) throw new NotFoundException(`Dispute case ${disputeId} not found.`);

    const results = await this.constraintRepo.find({
      where: { dispute_id: disputeId },
      order: { created_at: 'ASC' },
    });

    return results.map((c) => this.toDto(c));
  }

  // ── GET ONE ────────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<SiteConstraintResponseDto> {
    const constraint = await this.constraintRepo.findOne({ where: { id } });
    if (!constraint) throw new NotFoundException(`Site constraint ${id} not found.`);
    return this.toDto(constraint);
  }

  // ── GET DOCUMENT URL ───────────────────────────────────────────────────────

  /**
   * Generates a short-lived SAS URL for the constraint's supporting document.
   * The URL is produced fresh on every request and is never stored.
   * The raw blob path in the DB is never forwarded to the client.
   * Returns null when no document has been uploaded yet.
   */
  async getDocumentUrl(id: string): Promise<string | null> {
    const constraint = await this.constraintRepo.findOne({ where: { id } });
    if (!constraint) throw new NotFoundException(`Site constraint ${id} not found.`);
    if (!constraint.document_blob_url) return null;

    return this.azureBlobService.getFileUrl(constraint.document_blob_url);
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateSiteConstraintDto): Promise<SiteConstraintResponseDto> {
    const constraint = await this.constraintRepo.findOne({ where: { id } });
    if (!constraint) throw new NotFoundException(`Site constraint ${id} not found.`);

    const { attachment, ...scalarFields } = dto;
    Object.assign(constraint, scalarFields);

    if (attachment) {
      const disputeCase = await this.assertDisputeCaseExists(constraint.dispute_id);
      constraint.document_blob_url = await this.uploadAttachment(
        attachment,
        constraint.constraint_type,
        disputeCase.case_reference,
      );
    }

    if (constraint.document_blob_url) {
      await this.runVerificationFlow(constraint);
    }

    const saved = await this.constraintRepo.save(constraint);
    return this.toDto(saved);
  }

  // ── REMOVE ─────────────────────────────────────────────────────────────────

  async remove(id: string): Promise<void> {
    const constraint = await this.constraintRepo.findOne({ where: { id } });
    if (!constraint) throw new NotFoundException(`Site constraint ${id} not found.`);
    await this.constraintRepo.remove(constraint);
  }

  // ── PRIVATE ────────────────────────────────────────────────────────────────

  /**
   * Maps a SiteConstraint entity to the response DTO explicitly.
   * has_document is set as a real boolean here — no @Transform decorator magic,
   * no dependency on class-transformer options or NestJS global interceptors.
   */
  private toDto(entity: SiteConstraint): SiteConstraintResponseDto {
    const dto = new SiteConstraintResponseDto();
    dto.id              = entity.id;
    dto.dispute_id      = entity.dispute_id;
    dto.constraint_type = entity.constraint_type;
    dto.description     = entity.description;
    dto.legal_argument  = entity.legal_argument;
    dto.has_document    = !!entity.document_blob_url;   // ← always a real boolean
    dto.created_at      = entity.created_at;
    return dto;
  }

  /**
   * Uploads an attachment and returns the raw blob path for DB storage.
   * AzureBlobService.uploadToAzureBlob is called unchanged — the SAS URL it
   * returns is intentionally discarded. We reconstruct the same blobName
   * (`${folderName}/${caseReference}/${fileName}`) locally and store that.
   */
  private async uploadAttachment(
    base64: string,
    constraintType: ConstraintType,
    caseReference: string,
  ): Promise<string | null> {
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
    const fileName  = `constraints/${constraintType}__${timestamp}.pdf`;
    const blobName  = `${SiteConstraintsService.BLOB_FOLDER}/${caseReference}/${fileName}`;

    // Upload the file — the returned SAS URL is intentionally discarded.
    await this.azureBlobService.uploadToAzureBlob(
      base64,
      caseReference,
      SiteConstraintsService.BLOB_FOLDER,
      fileName,
    );

    return blobName;
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
    if (constraint.document_blob_url) return true;

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