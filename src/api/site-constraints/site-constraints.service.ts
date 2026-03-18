import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SiteConstraint, ConstraintType, ConstraintDocStatus } from './entities/site-constraint.entity';
import { CreateSiteConstraintDto, UpdateSiteConstraintDto } from './dto/site-constraint.dto';
import { AzureEmailService } from '../../common/azure-email/azure-email.service';

/** Maps each constraint type to the document_type values that satisfy it.
 *  Based on the `document_type` DB enum from the MVP schema. */
const REQUIRED_DOC_TYPES: Record<ConstraintType, string[]> = {
  [ConstraintType.HERITAGE_LISTING]:                    ['legal_document', 'property_report'],
  [ConstraintType.FLOOD_ZONE_100YR]:                    ['property_report', 'other'],
  [ConstraintType.BUSHFIRE_BAL_RESTRICTION]:            ['property_report', 'other'],
  [ConstraintType.EASEMENT_OR_RIGHT_OF_WAY]:            ['land_title_search', 'legal_document'],
  [ConstraintType.ENVIRONMENTAL_CONSERVATION_OVERLAY]:  ['property_report', 'other'],
  [ConstraintType.ZONING_PLANNING_RESTRICTION]:         ['property_report', 'legal_document'],
  [ConstraintType.ACCESS_RESTRICTION_LANDLOCKED]:       ['land_title_search', 'property_report'],
  [ConstraintType.CONTAMINATION_REMEDIATION]:           ['property_report', 'independent_valuation'],
  [ConstraintType.OTHER]:                               ['other'],
};

const CONSTRAINT_LABELS: Record<ConstraintType, string> = {
  [ConstraintType.HERITAGE_LISTING]:                    'Heritage Listing',
  [ConstraintType.FLOOD_ZONE_100YR]:                    '100-Year Flood Zone',
  [ConstraintType.BUSHFIRE_BAL_RESTRICTION]:            'Bushfire BAL Restriction',
  [ConstraintType.EASEMENT_OR_RIGHT_OF_WAY]:            'Easement or Right of Way',
  [ConstraintType.ENVIRONMENTAL_CONSERVATION_OVERLAY]:  'Environmental Conservation Overlay',
  [ConstraintType.ZONING_PLANNING_RESTRICTION]:         'Zoning / Planning Restriction',
  [ConstraintType.ACCESS_RESTRICTION_LANDLOCKED]:       'Access Restriction (Landlocked)',
  [ConstraintType.CONTAMINATION_REMEDIATION]:           'Contamination / Remediation',
  [ConstraintType.OTHER]:                               'Other Constraint',
};

@Injectable()
export class SiteConstraintsService {
  private readonly logger = new Logger(SiteConstraintsService.name);

  constructor(
    @InjectRepository(SiteConstraint)
    private readonly constraintRepo: Repository<SiteConstraint>,
    private readonly azureEmail: AzureEmailService,
  ) {}

  // ── CREATE ─────────────────────────────────────────────────────────────────

  async create(dto: CreateSiteConstraintDto): Promise<SiteConstraint> {
    // Prevent duplicate constraint types on the same dispute
    const existing = await this.constraintRepo.findOne({
      where: { dispute_id: dto.dispute_id, constraint_type: dto.constraint_type },
    });
    if (existing) {
      throw new BadRequestException(
        `Constraint '${dto.constraint_type}' already exists on dispute ${dto.dispute_id}.`,
      );
    }

    const constraint = this.constraintRepo.create({
      ...dto,
      doc_status: ConstraintDocStatus.PENDING_DOCUMENTS,
      email_sent: false,
      email_retry_count: 0,
    });

    const saved = await this.constraintRepo.save(constraint);
    this.logger.log(
      `[CONSTRAINT] Created — id=${saved.id} dispute=${dto.dispute_id} type=${dto.constraint_type}`,
    );

    // Non-blocking: verify docs and trigger email if needed
    this.runVerificationFlow(saved).catch((err) =>
      this.logger.error(`Verification flow error for constraint ${saved.id}: ${err.message}`),
    );

    return saved;
  }

  // ── GET BY DISPUTE ─────────────────────────────────────────────────────────

  async findByDispute(disputeId: string): Promise<SiteConstraint[]> {
    return this.constraintRepo.find({
      where: { dispute_id: disputeId },
      order: { created_at: 'ASC' },
    });
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

    // If a document blob URL was just provided, re-run verification
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

  // ── DOCUMENT VERIFICATION + EMAIL FLOW ────────────────────────────────────

  async runVerificationFlow(constraint: SiteConstraint): Promise<void> {
    const hasDocuments = await this.hasRequiredDocuments(constraint);

    if (hasDocuments) {
      await this.constraintRepo.update(constraint.id, {
        doc_status: ConstraintDocStatus.DOCUMENTS_UPLOADED,
      });
      this.logger.log(`[CONSTRAINT] doc_status → DOCUMENTS_UPLOADED — id=${constraint.id}`);
      return;
    }

    if (!constraint.email_sent) {
      await this.sendMissingDocumentEmail(constraint);
    }
  }

  async retryVerification(constraintId: string): Promise<void> {
    const constraint = await this.findOne(constraintId);

    if (
      constraint.doc_status === ConstraintDocStatus.DOCUMENTS_UPLOADED ||
      constraint.doc_status === ConstraintDocStatus.VERIFIED
    ) {
      return;
    }

    const hasDocuments = await this.hasRequiredDocuments(constraint);

    if (hasDocuments) {
      await this.constraintRepo.update(constraintId, {
        doc_status: ConstraintDocStatus.DOCUMENTS_UPLOADED,
      });
      this.logger.log(`[CONSTRAINT] Docs received on retry — id=${constraintId}`);
      return;
    }

    await this.sendMissingDocumentEmail(constraint);
  }

  async findAllPendingDocuments(): Promise<SiteConstraint[]> {
    return this.constraintRepo.find({
      where: { doc_status: ConstraintDocStatus.PENDING_DOCUMENTS },
    });
  }

  // ── PRIVATE ────────────────────────────────────────────────────────────────

  private async hasRequiredDocuments(constraint: SiteConstraint): Promise<boolean> {
    // Check 1: constraint has its own document_blob_url set directly
    if (constraint.document_blob_url) return true;

    // Check 2: raw query against dispute_documents table — no entity import needed
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
      `[DOC_VERIFY] dispute=${constraint.dispute_id} type=${constraint.constraint_type} required=${requiredTypes.join(',')} found=${count}`,
    );
    return count > 0;
  }

  private async sendMissingDocumentEmail(constraint: SiteConstraint): Promise<void> {
    const label = CONSTRAINT_LABELS[constraint.constraint_type] ?? constraint.constraint_type;
    const requiredTypes = REQUIRED_DOC_TYPES[constraint.constraint_type] ?? [];

    // Resolve client email by joining dispute → client via raw query
    const rows = await this.constraintRepo.query(
      `SELECT c.email, dc.case_reference
       FROM site_constraints sc
       INNER JOIN dispute_cases dc ON dc.id = sc.dispute_id
       INNER JOIN clients c ON c.id = dc.client_id
       WHERE sc.id = $1`,
      [constraint.id],
    );

    const clientEmail: string | undefined = rows[0]?.email;
    const caseReference: string = rows[0]?.case_reference ?? constraint.dispute_id;

    if (!clientEmail) {
      this.logger.warn(
        `[CONSTRAINT] No client email found for constraint ${constraint.id} — skipping email.`,
      );
      return;
    }

    await this.azureEmail.sendConstraintDocumentRequest(
      caseReference,
      label,
      requiredTypes,
      clientEmail,
    );

    await this.constraintRepo.update(constraint.id, {
      email_sent: true,
      email_sent_at: new Date(),
      email_retry_count: (constraint.email_retry_count ?? 0) + 1,
    });

    this.logger.log(
      `[CONSTRAINT] Missing-doc email sent → ${clientEmail} | constraint=${constraint.id} retry=${constraint.email_retry_count + 1}`,
    );
  }
}