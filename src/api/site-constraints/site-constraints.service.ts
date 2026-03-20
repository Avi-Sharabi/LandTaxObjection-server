import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SiteConstraint, ConstraintType } from './entities/site-constraint.entity';
import { CreateSiteConstraintDto, UpdateSiteConstraintDto } from './dto/site-constraint.dto';
import { AzureBlobService } from '../../common/azure-blob/azure-blob.service';

/** Maps each constraint type to the document_type values that satisfy it.
 *  Based on the `document_type` DB enum from the MVP schema. */
const REQUIRED_DOC_TYPES: Record<ConstraintType, string[]> = {
  [ConstraintType.HERITAGE_LISTING]: ['legal_document', 'property_report'],
  [ConstraintType.FLOOD_ZONE_100YR]: ['property_report', 'other'],
  [ConstraintType.BUSHFIRE_BAL_RESTRICTION]: ['property_report', 'other'],
  [ConstraintType.EASEMENT_OR_RIGHT_OF_WAY]: ['land_title_search', 'legal_document'],
  [ConstraintType.ENVIRONMENTAL_CONSERVATION_OVERLAY]: ['property_report', 'other'],
  [ConstraintType.ZONING_PLANNING_RESTRICTION]: ['property_report', 'legal_document'],
  [ConstraintType.ACCESS_RESTRICTION_LANDLOCKED]: ['land_title_search', 'property_report'],
  [ConstraintType.CONTAMINATION_REMEDIATION]: ['property_report', 'independent_valuation'],
  [ConstraintType.OTHER]: ['other'],
};

@Injectable()
export class SiteConstraintsService {
  private readonly logger = new Logger(SiteConstraintsService.name);

  constructor(
    @InjectRepository(SiteConstraint)
    private readonly constraintRepo: Repository<SiteConstraint>,
    private readonly azureBlobService: AzureBlobService,
  ) { }

  // ── CREATE ─────────────────────────────────────────────────────────────────

  async create(dto: CreateSiteConstraintDto, userId: string): Promise<SiteConstraint> {
    // Prevent duplicate constraint types on the same dispute
    const existing = await this.constraintRepo.findOne({
      where: { dispute_id: dto.dispute_id, constraint_type: dto.constraint_type },
    });
    if (existing) {
      throw new BadRequestException(
        `Constraint '${dto.constraint_type}' already exists on dispute ${dto.dispute_id}.`,
      );
    }

    const constraint = this.constraintRepo.create({ ...dto });

    // ── Azure Blob upload ──────────────────────────────────────────────────
    // If the caller supplied a raw base64 attachment, upload it to Azure and
    // store the resulting SAS URL in document_blob_url automatically.
    if (dto.attachment) {
      try {
        const blobName = await this.azureBlobService.uploadToAzureBlob(
          dto.attachment,
          dto.dispute_id,
          'site-constraints',
          'constraint-document.pdf',  // ← add fileName
        );
        if (blobName) {
          const sasUrl = await this.azureBlobService.getFileUrl(blobName);
          constraint.document_blob_url = sasUrl;
        }
      } catch (err) {
        this.logger.error(
          `[CONSTRAINT] Azure upload failed — dispute=${dto.dispute_id} error=${err.message}`,
        );
        // Non-fatal: constraint is still created; document_blob_url stays null
      }
    }

    const saved = await this.constraintRepo.save(constraint);

    // Log: constraint selection + user info + timestamp
    this.logger.log(
      `[CONSTRAINT] Created — id=${saved.id} type=${dto.constraint_type} dispute=${dto.dispute_id} user=${userId} timestamp=${saved.created_at.toISOString()}`,
    );

    // Validation: constraint selected → check for supporting documents
    this.runVerificationFlow(saved).catch((err) =>
      this.logger.error(
        `[CONSTRAINT] Verification flow error — id=${saved.id} error=${err.message}`,
      ),
    );

    return saved;
  }

  // ── GET BY DISPUTE ─────────────────────────────────────────────────────────

  async findByDispute(disputeId: string): Promise<SiteConstraint[]> {
    const results = await this.constraintRepo.find({
      where: { dispute_id: disputeId },
      order: { created_at: 'ASC' },
    });

    this.logger.log(
      `[CONSTRAINT] Fetched ${results.length} constraint(s) — dispute=${disputeId}`,
    );

    return results;
  }

  // ── GET ONE ────────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<SiteConstraint> {
    const constraint = await this.constraintRepo.findOne({ where: { id } });
    if (!constraint) throw new NotFoundException(`Site constraint ${id} not found.`);
    return constraint;
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateSiteConstraintDto): Promise<SiteConstraint> {
    const constraint = await this.findOne(id);
    Object.assign(constraint, dto);

    // Re-run document verification if blob URL was just provided
    if (dto.document_blob_url) {
      await this.runVerificationFlow(constraint);
    }

    const saved = await this.constraintRepo.save(constraint);
    this.logger.log(`[CONSTRAINT] Updated — id=${id}`);
    return saved;
  }

  // ── REMOVE ─────────────────────────────────────────────────────────────────

  async remove(id: string): Promise<void> {
    const constraint = await this.findOne(id);
    await this.constraintRepo.remove(constraint);
    this.logger.log(`[CONSTRAINT] Removed — id=${id}`);
  }

  // ── DOCUMENT VERIFICATION FLOW ─────────────────────────────────────────────

  /**
   * KAN-8 Validation logic:
   *  1. Constraint selected → check for supporting documents
   *  2. Query dispute_documents for uploaded files
   *  3. Match against required types for this constraint_type
   */
  async runVerificationFlow(constraint: SiteConstraint): Promise<void> {
    const hasDocuments = await this.hasRequiredDocuments(constraint);

    if (hasDocuments) {
      this.logger.log(
        `[CONSTRAINT] Supporting documents found — id=${constraint.id} type=${constraint.constraint_type}`,
      );
    } else {
      this.logger.warn(
        `[CONSTRAINT] Missing supporting documents — id=${constraint.id} type=${constraint.constraint_type} dispute=${constraint.dispute_id}`,
      );
    }
  }

  // ── PRIVATE ────────────────────────────────────────────────────────────────

  private async hasRequiredDocuments(constraint: SiteConstraint): Promise<boolean> {
    // Check 1: document_blob_url set directly on the constraint
    if (constraint.document_blob_url) return true;

    // Check 2: query dispute_documents for matching document types
    const requiredTypes = REQUIRED_DOC_TYPES[constraint.constraint_type] ?? [];
    if (requiredTypes.length === 0) return false;

    const result = await this.constraintRepo.query(
      `SELECT COUNT(*) as count
       FROM dispute_documents
       WHERE dispute_id = $1
       AND document_type = ANY($2)`,
      [constraint.dispute_id, requiredTypes],
    );

    const count = parseInt(result[0]?.count ?? '0', 10);

    this.logger.debug(
      `[CONSTRAINT] Doc check — dispute=${constraint.dispute_id} type=${constraint.constraint_type} required=[${requiredTypes.join(', ')}] found=${count}`,
    );

    return count > 0;
  }
}