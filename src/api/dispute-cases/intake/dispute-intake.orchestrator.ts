import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
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
import { normalizePropertyAddress, resolveSuburbWithFallback } from 'src/common/utils/address-parser.util';

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
      // create_dispute defaults to true when not provided. This guard runs *before* the property
      // is persisted — it used to sit after it, which left an orphan property row with no case
      // attached whenever a submitter unticked "create dispute".
      if (prop.create_dispute === false) {
        continue;
      }

      const property = await this.findOrCreateProperty(client.id, prop);

      const flags = this.mapConstraintsToFlags(prop.constraints ?? []);
      const notice = await this.createValuationNotice(property.id, prop.valuation_notice, intakeDto.valuationYear, assessmentDocument.id, intakeDto.noticeDate);
      const { disputeCase, caseReference } = await this.createDisputeCaseWithUniqueReference(
        client as Client, property.id, notice.id, prop.state, prop.valuation_notice.assessed_land_value, intakeDto, flags, authoritativeDeadline, deadlineLapsed,
      );

      await this.createLegalGrounds(disputeCase.id, prop.grounds ?? []);

      // Deliberately last. submitIntakeApplication still has no transaction, so anything before
      // this point can fail mid-loop; running the backfill here means a failed intake can only ever
      // leave behind a new orphan row (the pre-existing behaviour) rather than permanently editing
      // a property an already-lodged case depends on.
      await this.backfillProperty(property, prop);

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

  /**
   * A client's properties are meant to be shared across their dispute cases — `dispute_cases`
   * carries the FK and `Property` has `@OneToMany dispute_cases`. This used to be an unconditional
   * INSERT, so every submission minted a fresh row and a second case for a property the client
   * already owned showed up as a duplicate property instead of a second case on the existing one.
   */
  private async findOrCreateProperty(clientId: string, prop: IntakePropertyDto): Promise<Property> {
    const existing = await this.findExistingProperty(clientId, prop);
    if (existing) {
      return existing;
    }

    try {
      return await this.insertProperty(clientId, prop);
    } catch (err) {
      if (!this.isUniqueViolation(err)) throw err;
      // A concurrent submission inserted the same property between our lookup and this insert.
      // Matched on the error code rather than a constraint name so this keeps working unchanged
      // once the follow-up unique index lands.
      const raced = await this.findExistingProperty(clientId, prop);
      if (!raced) throw err;
      this.logger.warn(
        `[INTAKE] Property insert for client ${clientId} collided with a concurrent submission — reusing ${raced.id}.`,
      );
      return raced;
    }
  }

  /**
   * PID first when the submission carries one — it's the authoritative NSW identifier and survives
   * address-formatting differences — then the normalized address. `state` is part of the address key
   * because a false *miss* only reproduces the old duplicate behaviour, whereas a false *merge*
   * corrupts data.
   */
  private async findExistingProperty(clientId: string, prop: IntakePropertyDto): Promise<Property | null> {
    const addressKey = normalizePropertyAddress(prop.address);
    const pid = prop.pid?.trim();

    // Duplicates already exist in live data (that's what this fix stops creating more of), so both
    // lookups order by created_at — otherwise successive intakes for one property can attach to
    // different rows of the same duplicate group. ASC matches the merge target that
    // src/database/scripts/find-duplicate-properties.sql reports.
    const oldestFirst = { created_at: 'ASC' } as const;

    if (pid) {
      const byPid = await this.propertiesRepository.findOne({
        where: { client_id: clientId, pid },
        order: oldestFirst,
      });
      if (byPid) {
        // A PID hit is only accepted when the address agrees. Treating PID as authoritative on its
        // own means one mistyped digit silently attaches this case to a different property — and
        // the wrong address and land value then flow into the objection package lodged with the VG.
        // Falling through costs at most a duplicate row, which is the recoverable failure.
        if (byPid.address_normalized === addressKey) {
          return byPid;
        }
        this.logger.warn(
          `[INTAKE] PID ${pid} matches property ${byPid.id} for client ${clientId}, but the submitted ` +
          `address does not. Ignoring the PID match — check for a mistyped PID.`,
        );
      }
    }

    // normalizePropertyAddress can legitimately return '' (e.g. "NSW 2000", ",,,"), and @IsNotEmpty
    // does not catch those. Matching on an empty key would merge every junk address for this client
    // into one property, so there is nothing safe to look up.
    if (!addressKey) return null;

    return this.propertiesRepository.findOne({
      where: { client_id: clientId, state: prop.state, address_normalized: addressKey },
      order: oldestFirst,
    });
  }

  private async insertProperty(clientId: string, prop: IntakePropertyDto): Promise<Property> {
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

  /**
   * Fill blanks only. The stored row wins: an earlier dispute case may already have been lodged
   * against these values, so a later submission must not rewrite them. "Blank" covers the empty
   * string as well as null, because `postcode` is hardcoded to '' on insert and
   * `resolveSuburbWithFallback` returns '' when it can't parse. A genuine disagreement is logged
   * rather than silently applied.
   */
  private async backfillProperty(property: Property, prop: IntakePropertyDto): Promise<Property> {
    const updates: Partial<Property> = {};

    const incomingPid = prop.pid?.trim();
    if (incomingPid) {
      if (!property.pid) updates.pid = incomingPid;
      else if (property.pid !== incomingPid) this.warnFieldConflict(property, 'pid', property.pid, incomingPid);
    }

    // Derived from the address rather than submitted, so a mismatch isn't a user disagreement.
    const incomingSuburb = resolveSuburbWithFallback(prop.address);
    if (incomingSuburb && !property.suburb) updates.suburb = incomingSuburb;

    const incomingOwnership = prop.ownership_pct;
    if (incomingOwnership !== null && incomingOwnership !== undefined) {
      if (property.ownership_pct === null || property.ownership_pct === undefined) {
        updates.ownership_pct = incomingOwnership;
      } else if (Number(property.ownership_pct) !== Number(incomingOwnership)) {
        // numeric(5,2) comes back as a string, so compare numerically or "100.00" vs 100 misfires.
        this.warnFieldConflict(property, 'ownership_pct', property.ownership_pct, incomingOwnership);
      }
    }

    if (Object.keys(updates).length === 0) return property;

    Object.assign(property, updates);
    return this.propertiesRepository.save(property);
  }

  private warnFieldConflict(property: Property, column: string, stored: unknown, incoming: unknown): void {
    this.logger.warn(
      `[INTAKE] Property ${property.id} already has ${column}=${String(stored)}; this submission says ` +
      `${String(incoming)}. Keeping the stored value — resolve manually if the new value is correct.`,
    );
  }

  private isUniqueViolation(err: unknown): boolean {
    if (!(err instanceof QueryFailedError)) return false;
    return (err as QueryFailedError & { code?: string }).code === '23505';
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

  private static readonly MAX_CASE_REFERENCE_ATTEMPTS = 3;

  // generateCaseReference() + createDisputeCase() are retried together as a belt-and-braces guard.
  // The DB sequence backing generateCaseReference() already makes collisions practically impossible,
  // so this should never fire in normal operation — it only covers the case where the sequence has
  // drifted behind the rows actually in the table (e.g. references inserted outside the intake flow,
  // or a restore that reloaded dispute_cases without re-running the sequence's setval).
  private async createDisputeCaseWithUniqueReference(
    client: Client,
    propertyId: string,
    valuationNoticeId: string,
    jurisdiction: Jurisdiction,
    assessedLandValue: number | null,
    intakeDto: CreateDisputeIntakeDto,
    flags: PropertyFlags,
    statutoryDeadline: Date,
    deadlineLapsedFlagged: boolean,
  ): Promise<{ disputeCase: DisputeCase; caseReference: string }> {
    for (let attempt = 1; attempt <= DisputeIntakeOrchestrator.MAX_CASE_REFERENCE_ATTEMPTS; attempt++) {
      const caseReference = await this.generateCaseReference();
      try {
        const disputeCase = await this.createDisputeCase(
          client, propertyId, valuationNoticeId, caseReference, jurisdiction,
          assessedLandValue, intakeDto, flags, statutoryDeadline, deadlineLapsedFlagged,
        );
        return { disputeCase, caseReference };
      } catch (err) {
        const isLastAttempt = attempt === DisputeIntakeOrchestrator.MAX_CASE_REFERENCE_ATTEMPTS;
        if (this.isDuplicateCaseReferenceError(err) && !isLastAttempt) {
          this.logger.warn(`Case reference ${caseReference} collided with a concurrent submission (attempt ${attempt}) — retrying with a new reference.`);
          continue;
        }
        throw err;
      }
    }
    // Unreachable — the loop always returns or throws — but keeps TypeScript satisfied.
    throw new Error('Failed to generate a unique case reference after retries');
  }

  private isDuplicateCaseReferenceError(err: unknown): boolean {
    if (!(err instanceof QueryFailedError)) return false;
    const driverErr = err as QueryFailedError & { code?: string; constraint?: string };
    return driverErr.code === '23505' && driverErr.constraint === 'UQ_dispute_cases_case_reference';
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
    // A DB sequence, not repository.count() + 1 or MAX(existing) + 1 — those reads are non-atomic
    // (two concurrent intake requests can read the same value and mint duplicate case references).
    // nextval also never reissues a number, so deleting cases — soft via the UI or the batch delete,
    // or hard via the retention cleanup task — can't free up a reference still in use elsewhere.
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
