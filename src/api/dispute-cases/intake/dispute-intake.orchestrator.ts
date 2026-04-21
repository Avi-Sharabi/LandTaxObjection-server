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
import { AssessmentDocument } from '../entities/assessment-document.entity';
import { DisputeLegalGround, LegalGround } from '../../dispute-legal-grounds/entities/dispute-legal-ground.entity';
import { Property, Jurisdiction } from '../../properties/entities/property.entity';
import { ValuationNotice } from '../../valuation-notices/entities/valuation-notice.entity';
import { User } from '../../users/entities/user.entity';
import { XpmClientHandler } from './xpm-client.handler';
import { PdfStorageHandler } from './pdf-storage.handler';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';
import { AccountantNotFoundException } from '../exceptions/accountant-not-found.exception';
import { Client } from '../../clients/entities/client.entity';

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
    @InjectRepository(AssessmentDocument)
    private assessmentDocumentsRepository: Repository<AssessmentDocument>,
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
    const assessmentDocument = await this.createAssessmentDocument(client.id, null, intakeDto.noticeDate, intakeDto.valuationYear);

    // Upload PDF into assessment-documents/{doc.id}/valuation-notice.pdf
    const filePath = await this.pdfStorageHandler.handlePdfStorage(
      intakeDto.attachment,
      assessmentDocument.id,
      !!xpmClient,
      assessmentDocument.id,  // folder identifier — caseReference not yet available at this stage
    );
    if (filePath) {
      await this.assessmentDocumentsRepository.update(assessmentDocument.id, { file_path: filePath });
      assessmentDocument.file_path = filePath;
    }

    const caseReferences: string[] = [];

    for (const prop of intakeDto.properties) {
      const property = await this.createProperty(client.id, prop);

      // create_dispute defaults to true when not provided
      if (prop.create_dispute === false) {
        continue;
      }

      const caseReference = await this.generateCaseReference();

      const flags = this.mapConstraintsToFlags(prop.constraints ?? []);
      const notice = await this.createValuationNotice(property.id, prop.valuation_notice, intakeDto.valuationYear, assessmentDocument.id);
      const disputeCase = await this.createDisputeCase(client, property.id, notice.id, caseReference, prop.state, prop.valuation_notice.assessed_land_value, intakeDto, flags);

      await this.createLegalGrounds(disputeCase.id, prop.grounds ?? []);
      caseReferences.push(caseReference);
    }

    if (caseReferences.length > 0) {
      await this.notifyAssessors(caseReferences, intakeDto.accountantId);
    }

    return { case_references: caseReferences };
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
    filePath: string | null,
    noticeDate: string,
    valuationYear: string,
  ): Promise<AssessmentDocument> {
    const doc = this.assessmentDocumentsRepository.create({
      client_id: clientId,
      file_path: filePath,
      notice_date: new Date(noticeDate),
      valuation_year: valuationYear,
    });
    return this.assessmentDocumentsRepository.save(doc);
  }

  private async createProperty(clientId: string, prop: IntakePropertyDto): Promise<Property> {
    const property = this.propertiesRepository.create({
      client_id: clientId,
      address: prop.address,
      suburb: prop.address.split(',')[1]?.trim() || '',
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
  ): Promise<ValuationNotice> {
    const notice = this.valuationNoticesRepository.create({
      property_id: propertyId,
      valuation_date: new Date(valuationNotice.valuation_date),
      assessed_land_value: valuationNotice.assessed_land_value ?? null,
      is_exempt: valuationNotice.assessed_land_value === null ? true : false,
      notice_reference: `INTAKE-${valuationYear}-${Date.now()}`,
      source_document_id: sourceDocumentId,
    });
    return this.valuationNoticesRepository.save(notice);
  }

  private async createDisputeCase(
    client: any,
    propertyId: string,
    valuationNoticeId: string,
    caseReference: string,
    jurisdiction: Jurisdiction,
    assessedLandValue: number | null,
    intakeDto: CreateDisputeIntakeDto,
    flags: PropertyFlags,
  ): Promise<DisputeCase> {
    const disputeCase = this.disputeCasesRepository.create({
      case_reference: caseReference,
      client_id: client.id,
      property_id: propertyId,
      valuation_notice_id: valuationNoticeId,
      assigned_accountant_id: intakeDto.accountantId,
      jurisdiction,
      status: DisputeStatus.DRAFT,
      statutory_deadline: new Date(intakeDto.statutoryDeadline),
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

  private async notifyAssessors(caseReferences: string[], accountantId?: string): Promise<void> {
    if (accountantId) {
      await this.notifyInternalAssessor(caseReferences, accountantId);
      return;
    }
    const assessorEmail = this.config.get<string>('ASSESSOR_EMAIL');
    if (!assessorEmail) return;
    await this.azureEmailService.sendDisputeApplication(caseReferences, assessorEmail);
  }

  private async notifyInternalAssessor(caseReferences: string[], accountantId: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: accountantId } });
    if (!user) {
      console.warn(`Accountant with ID ${accountantId} not found. Skipping email notification.`);
      return;
    }
    await this.azureEmailService.sendDisputeApplication(caseReferences, user.email);
  }

  private async generateCaseReference(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.disputeCasesRepository.count();
    const sequence = (count + 1).toString().padStart(6, '0');
    return `LTD-${year}-${sequence}`;
  }
}