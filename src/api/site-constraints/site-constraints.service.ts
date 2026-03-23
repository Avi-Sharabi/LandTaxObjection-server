import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';

import { SiteConstraint, ConstraintType } from './entities/site-constraints.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { DisputeDocument } from '../dispute-documents/entities/dispute-document.entity';
import { CreateSiteConstraintDto, UpdateSiteConstraintDto } from './dto/site-constraints.dto';
import { SiteConstraintResponseDto } from './dto/site-constraints-response.dto';
import { AzureBlobService } from '../../common/azure-blob/azure-blob.service';
import { REQUIRED_DOC_TYPES } from './constants/required-doc-types.constant';
import { DuplicateConstraintException } from './exceptions/duplicate-constraint.exception';

@Injectable()
export class SiteConstraintsService {
  private readonly logger = new Logger(SiteConstraintsService.name);

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
      dispute_id:        dto.dispute_id,
      constraint_type:   dto.constraint_type,
      description:       dto.description      ?? null,
      legal_argument:    dto.legal_argument    ?? null,
      document_blob_url: dto.document_blob_url ?? null,
    });

    if (dto.attachment) {
      // Build unique filename: constraint_type__YYYYMMDD_HHmmssSSS.pdf
      // Prevents overwriting existing blobs for the same constraint on the same case.
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
      const fileName  = `constraints/${dto.constraint_type}__${timestamp}.pdf`;
      const blobName = await this.azureBlobService.uploadToAzureBlob(
        dto.attachment,
        disputeCase.case_reference,
        'dispute-cases',
        fileName,
      );
      if (blobName) {
        constraint.document_blob_url = blobName; // uploadToAzureBlob already returns the full SAS URL
      }
    }

    const saved = await this.constraintRepo.save(constraint);

    // R80: db_created_at disambiguates from log aggregator wall-clock stamp
    this.logger.log(
      `[CONSTRAINT] Created — id=${saved.id} type=${saved.constraint_type} dispute=${saved.dispute_id} user=${userId} db_created_at=${saved.created_at.toISOString()}`,
    );

    this.runVerificationFlow(saved).catch((err) =>
      // R84: safe whether thrown value is an Error, string, or anything else
      this.logger.error(
        `[CONSTRAINT] Verification flow error — id=${saved.id} type=${saved.constraint_type} dispute=${saved.dispute_id} error=${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    return plainToInstance(SiteConstraintResponseDto, saved);
  }

  // ── GET BY DISPUTE ─────────────────────────────────────────────────────────

  async findByDispute(disputeId: string): Promise<SiteConstraintResponseDto[]> {
    const exists = await this.disputeCaseRepo.existsBy({ id: disputeId });
    if (!exists) throw new NotFoundException(`Dispute case ${disputeId} not found.`);

    const results = await this.constraintRepo.find({
      where: { dispute_id: disputeId },
      order: { created_at: 'ASC' },
    });

    return plainToInstance(SiteConstraintResponseDto, results);
  }

  // ── GET ONE ────────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<SiteConstraintResponseDto> {
    const constraint = await this.constraintRepo.findOne({ where: { id } });
    if (!constraint) throw new NotFoundException(`Site constraint ${id} not found.`);
    return plainToInstance(SiteConstraintResponseDto, constraint);
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateSiteConstraintDto): Promise<SiteConstraintResponseDto> {
    const constraint = await this.constraintRepo.findOne({ where: { id } });
    if (!constraint) throw new NotFoundException(`Site constraint ${id} not found.`);

    // Apply scalar fields (description, legal_argument, document_blob_url)
    // Exclude attachment — it's handled separately below and must not be persisted as-is.
    const { attachment, ...scalarFields } = dto;
    Object.assign(constraint, scalarFields);

    // Upload new file if attachment provided (base64 → Azure Blob → SAS URL)
    if (attachment) {
      const disputeCase = await this.assertDisputeCaseExists(constraint.dispute_id);
      const timestamp   = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
      const fileName    = `constraints/${constraint.constraint_type}__${timestamp}.pdf`;

      const blobUrl = await this.azureBlobService.uploadToAzureBlob(
        attachment,
        disputeCase.case_reference,
        'dispute-cases',
        fileName,
      );
      if (blobUrl) {
        constraint.document_blob_url = blobUrl;
      }
    }

    if (constraint.document_blob_url) {
      await this.runVerificationFlow(constraint);
    }

    const saved = await this.constraintRepo.save(constraint);
    return plainToInstance(SiteConstraintResponseDto, saved);
  }

  // ── REMOVE ─────────────────────────────────────────────────────────────────

  async remove(id: string): Promise<void> {
    const constraint = await this.constraintRepo.findOne({ where: { id } });
    if (!constraint) throw new NotFoundException(`Site constraint ${id} not found.`);
    await this.constraintRepo.remove(constraint);
  }

  // ── PRIVATE ────────────────────────────────────────────────────────────────

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

  // R148: private — internal detail, not part of the public service API
  private async runVerificationFlow(constraint: SiteConstraint): Promise<void> {
    const hasDocuments = await this.hasRequiredDocuments(constraint);

    if (hasDocuments) {
      // R137: includes dispute_id and constraint_type for traceability
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

    // R172/R180: injected repository + typed .count() — no raw SQL
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