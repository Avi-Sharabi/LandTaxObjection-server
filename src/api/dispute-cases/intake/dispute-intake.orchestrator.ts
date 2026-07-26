import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  CreateDisputeIntakeDto,
  IntakePropertyDto,
  IntakeValuationNoticeDto,
} from '../dto/create-dispute-intake.dto';
import { DisputeCase, DisputeStatus } from '../entities/dispute-case.entity';
import { AssessmentDocument } from '../../assessment-documents/entities/assessment-document.entity';
import { AssessmentDocumentsService } from '../../assessment-documents/assessment-documents.service';
import { DisputeLegalGround, LegalGround } from '../../dispute-legal-grounds/entities/dispute-legal-ground.entity';
import { Property, Jurisdiction } from '../../properties/entities/property.entity';
import { ValuationNotice } from '../../valuation-notices/entities/valuation-notice.entity';
import { User } from '../../users/entities/user.entity';
import { XpmClientHandler } from './xpm-client.handler';
import { PdfStorageHandler } from './pdf-storage.handler';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';
import { AccountantNotFoundException } from '../exceptions/accountant-not-found.exception';
import { CaseReferenceGenerationFailedException } from '../exceptions/case-reference-generation-failed.exception';
import { Client, ClientStatus } from '../../clients/entities/client.entity';
import { resolveSuburbWithFallback } from 'src/common/utils/address-parser.util';

interface PropertyFlags {
  flag_heritage: boolean;
  flag_easement: boolean;
  flag_flood_zone: boolean;
  flag_environmental: boolean;
  flag_zoning: boolean;
}

@Injectable()
export class DisputeIntakeOrchestrator {
  private readonly logger = new Logger(DisputeIntakeOrchestrator.name);

  constructor(
    private readonly config: ConfigService,
    private readonly xpmClientHandler: XpmClientHandler,
    private readonly pdfStorageHandler: PdfStorageHandler,
    private readonly azureEmailService: AzureEmailService,
    @InjectRepository(DisputeCase)
    private disputeCasesRepository: Repository<DisputeCase>,
    private readonly assessmentDocumentsService: AssessmentDocumentsService,
    @InjectRepository(DisputeLegalGround)
    private legalGroundsRepository: Repository<DisputeLegalGround>,
    @InjectRepository(Property)
    private propertiesRepository: Repository<Property>,
    @InjectRepository(ValuationNotice)
    private valuationNoticesRepository: Repository<ValuationNotice>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) { }

  async submitIntakeApplication(intakeDto: CreateDisputeIntakeDto): Promise<{ case_references: string[] }> {
    await this.validateAccountant(intakeDto.accountantId);

    const xpmClient = await this.xpmClientHandler.findClientInXpm(intakeDto.fullName);

    const client = xpmClient
      ? await this.xpmClientHandler.handleExistingClient(intakeDto, xpmClient)
      : await this.xpmClientHandler.handleNewProspect(intakeDto);

    // Create the source document first so its UUID can be used as the storage folder
    const assessmentDocument = await this.createAssessmentDocument(client.id, null);

    // Upload PDF into assessment-documents/{doc.id}/valuation-notice.pdf
    const filePath = await this.pdfStorageHandler.handlePdfStorage(
      intakeDto.attachment,
      assessmentDocument.id,
      !!xpmClient,
      assessmentDocument.id,  // folder identifier — caseReference not yet available at this stage
    );
    if (filePath) {
      await this.assessmentDocumentsService.updateFilePath(assessmentDocument.id, filePath);
      assessmentDocument.file_path = filePath;
    }

    const caseReferences: string[] = [];
    const propertyAddresses: string[] = [];

    // noticeDate/statutoryDeadline are intake-level (shared across all properties in this
    // submission), so the freshness check only needs to run once rather than per-property.
    const { authoritativeDeadline, deadlineLapsed } = this.resolveStatutoryDeadline(
      intakeDto.noticeDate,
      intakeDto.statutoryDeadline,
    );

    for (const prop of intakeDto.properties) {
      const property = await this.createProperty(client.id, prop);

      // create_dispute defaults to true when not provided
      if (prop.create_dispute === false) {
        continue;
      }

      const caseReference = await this.generateCaseReference();

      const flags = this.mapConstraintsToFlags(prop.constraints ?? []);
      const notice = await this.createValuationNotice(property.id, prop.valuation_notice, intakeDto.valuationYear, assessmentDocument.id, intakeDto.noticeDate);
      const disputeCase = await this.createDisputeCase(client as Client, property.id, notice.id, caseReference, prop.state, prop.valuation_notice.assessed_land_value, intakeDto, flags, authoritativeDeadline, deadlineLapsed);

      await this.createLegalGrounds(disputeCase.id, prop.grounds ?? []);
      caseReferences.push(caseReference);
      propertyAddresses.push(prop.address);
    }

    if (caseReferences.length > 0) {
      await this.notifyAssessors(caseReferences, propertyAddresses, intakeDto.fullName, intakeDto.accountantId, deadlineLapsed, authoritativeDeadline);
    }

    return { case_references: caseReferences };
  }

  /**
   * The frontend pre-computes statutoryDeadline = noticeDate + 60 days and sends both values in,
   * but nothing previously checked that arithmetic server-side, or whether the result was already
   * in the past. Recompute independently and prefer the server value on any material disagreement.
   */
  private resolveStatutoryDeadline(
    noticeDateStr: string,
    statutoryDeadlineStr: string,
  ): { authoritativeDeadline: Date; deadlineLapsed: boolean } {
    const frontendDeadline = new Date(statutoryDeadlineStr);
    let authoritativeDeadline = frontendDeadline;

    const noticeIssueDate = new Date(noticeDateStr);
    if (!isNaN(noticeIssueDate.getTime())) {
      const recomputed = new Date(noticeIssueDate);
      recomputed.setDate(recomputed.getDate() + 60);
      const diffDays = Math.abs((recomputed.getTime() - frontendDeadline.getTime()) / 86_400_000);
      if (diffDays > 1) {
        this.logger.warn(
          `[INTAKE] statutoryDeadline mismatch — frontend=${statutoryDeadlineStr}, ` +
          `server-recomputed=${recomputed.toISOString().split('T')[0]} (noticeDate=${noticeDateStr}). ` +
          `Using server-recomputed value as authoritative.`,
        );
        authoritativeDeadline = recomputed;
      }
    }

    const deadlineLapsed = authoritativeDeadline.getTime() < Date.now();
    return { authoritativeDeadline, deadlineLapsed };
  }

  private mapConstraintsToFlags(constraints: string[]): PropertyFlags {
    const normalised = constraints.map((c) => c.toLowerCase());
    return {
      flag_heritage: normalised.some((c) => c.includes('heritage')),
      flag_easement: normalised.some((c) => c.includes('easement')),
      flag_flood_zone: normalised.some((c) => c.includes('flood')),
      flag_environmental: normalised.some((c) => c.includes('environment')),
      flag_zoning: normalised.some((c) => c.includes('zoning')),
    };
  }

  private async createAssessmentDocument(
    clientId: string,
    _filePath: string | null,
    documentName = 'Land Tax Assessment Notice',
  ): Promise<AssessmentDocument> {
    // dispute_case_id intentionally null — this document is created before any per-property
    // DisputeCase exists (the case-creation loop runs later, per property); one intake can spawn
    // multiple cases sharing this single notice document, so it cannot be scoped to one case here.
    return this.assessmentDocumentsService.createInitialRecord(clientId, documentName, null);
  }

  private async createProperty(clientId: string, prop: IntakePropertyDto): Promise<Property> {
    const property = this.propertiesRepository.create({
      client_id: clientId,
      address: prop.address,
      suburb: resolveSuburbWithFallback(prop.address),
      state: prop.state,
      postcode: '',
      pid: prop.pid,
      ownership_pct: prop.ownership_pct,
    });
    return this.propertiesRepository.save(property);
  }

  private async createValuationNotice(
    propertyId: string,
    valuationNotice: IntakeValuationNoticeDto,
    valuationYear: string,
    sourceDocumentId: string,
    noticeDate: string,
  ): Promise<ValuationNotice> {
    const notice = this.valuationNoticesRepository.create({
      property_id: propertyId,
      valuation_date: new Date(valuationNotice.valuation_date),
      notice_issue_date: new Date(noticeDate),
      assessed_land_value: valuationNotice.assessed_land_value ?? null,
      is_exempt: valuationNotice.assessed_land_value === null ? true : false,
      notice_reference: `INTAKE-${valuationYear}-${Date.now()}`,
      source_document_id: sourceDocumentId,
    });
    return this.valuationNoticesRepository.save(notice);
  }

  private async createDisputeCase(
    client: Client,
    propertyId: string,
    valuationNoticeId: string,
    caseReference: string,
    jurisdiction: Jurisdiction,
    assessedLandValue: number | null,
    intakeDto: CreateDisputeIntakeDto,
    flags: PropertyFlags,
    statutoryDeadline: Date,
    deadlineLapsedFlagged: boolean,
  ): Promise<DisputeCase> {
    const disputeCase = this.disputeCasesRepository.create({
      case_reference: caseReference,
      client_id: client.id,
      property_id: propertyId,
      valuation_notice_id: valuationNoticeId,
      assigned_accountant_id: intakeDto.accountantId,
      jurisdiction,
      status: client.status === ClientStatus.PROSPECT ? DisputeStatus.PENDING_TNC : DisputeStatus.DRAFT,
      statutory_deadline: statutoryDeadline,
      deadline_lapsed_flagged: deadlineLapsedFlagged,
      original_assessed_value: assessedLandValue,
      notes: intakeDto.addNotes || null,
      ...flags,
    });
    return this.disputeCasesRepository.save(disputeCase);
  }

  private async createLegalGrounds(disputeId: string, grounds: LegalGround[]): Promise<void> {
    if (!grounds?.length) return;
    const legalGrounds = grounds.map((ground) =>
      this.legalGroundsRepository.create({ dispute_id: disputeId, ground, validated: false }),
    );
    await this.legalGroundsRepository.save(legalGrounds);
  }

  private async validateAccountant(accountantId?: string): Promise<void> {
    if (!accountantId) return;
    const accountant = await this.usersRepository.findOne({ where: { id: accountantId } });
    if (!accountant) throw new AccountantNotFoundException(accountantId);
  }

  private async notifyAssessors(
    caseReferences: string[],
    propertyAddresses: string[],
    clientName: string,
    accountantId?: string,
    deadlineLapsed = false,
    statutoryDeadline?: Date,
  ): Promise<void> {
    const deadlineLapsedWarning = deadlineLapsed
      ? `This case's statutory objection deadline (${statutoryDeadline?.toISOString().split('T')[0] ?? 'unknown'}) has already passed. Confirm with Revenue NSW whether a late objection can still be lodged before proceeding.`
      : undefined;
    if (accountantId) {
      await this.notifyInternalAssessor(caseReferences, propertyAddresses, clientName, accountantId, deadlineLapsedWarning);
      return;
    }
    const assessorEmail = this.config.get<string>('ASSESSOR_EMAIL');
    if (!assessorEmail) return;
    await this.azureEmailService.sendDisputeApplication(caseReferences, assessorEmail, { clientName, propertyAddresses, deadlineLapsedWarning });
  }

  private async notifyInternalAssessor(
    caseReferences: string[],
    propertyAddresses: string[],
    clientName: string,
    accountantId: string,
    deadlineLapsedWarning?: string,
  ): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: accountantId } });
    if (!user) {
      this.logger.warn(`Accountant with ID ${accountantId} not found. Skipping email notification.`);
      return;
    }
    await this.azureEmailService.sendDisputeApplication(caseReferences, user.email, {
      clientName,
      propertyAddresses,
      assessorName: user.fullName,
      deadlineLapsedWarning,
    });
  }

  private async generateCaseReference(): Promise<string> {
    const year = new Date().getFullYear();
    // A DB sequence, not repository.count() + 1 — the count is non-atomic (two concurrent intake
    // requests can read the same value and mint duplicate case references) and isn't stable under
    // soft-deletes.
    let nextval: string;
    try {
      const rows = await this.disputeCasesRepository.query<Array<{ nextval: string }>>(
        `SELECT nextval('dispute_case_reference_seq') AS nextval`,
      );
      nextval = rows[0].nextval;
    } catch (e) {
      // Log the raw driver/DB error server-side only — surfacing it to the client would leak
      // internal detail (sequence/table names, connection errors) the exception filter forwards
      // verbatim in the response body.
      this.logger.error(`generateCaseReference failed: ${(e as Error).message}`);
      throw new CaseReferenceGenerationFailedException();
    }
    const sequence = nextval.toString().padStart(6, '0');
    return `LTD-${year}-${sequence}`;
  }
}