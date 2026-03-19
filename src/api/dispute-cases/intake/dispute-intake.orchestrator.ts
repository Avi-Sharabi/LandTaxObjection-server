import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  CreateDisputeIntakeDto,
  IntakePropertyDto,
  IntakeValuationNoticeDto,
} from '../dto/create-dispute-intake.dto';
import { DisputeCase, DisputeStatus } from '../entities/dispute-case.entity';
import { DisputeLegalGround, LegalGround } from '../../dispute-legal-grounds/entities/dispute-legal-ground.entity';
import { Property, Jurisdiction } from '../../properties/entities/property.entity';
import { ValuationNotice } from '../../valuation-notices/entities/valuation-notice.entity';
import { User } from '../../users/entities/user.entity';
import { FyiClientHandler } from './fyi-client.handler';
import { PdfStorageHandler } from './pdf-storage.handler';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';

@Injectable()
export class DisputeIntakeOrchestrator {
  constructor(
    private readonly fyiClientHandler: FyiClientHandler,
    private readonly pdfStorageHandler: PdfStorageHandler,
    private readonly azureEmailService: AzureEmailService,
    private readonly config: ConfigService,
    @InjectRepository(DisputeCase)
    private disputeCasesRepository: Repository<DisputeCase>,
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
    const fyiClient = await this.fyiClientHandler.findClientInFyi(intakeDto.email);

    const client = fyiClient
      ? await this.fyiClientHandler.handleExistingClient(intakeDto, fyiClient)
      : await this.fyiClientHandler.handleNewProspect(intakeDto);

    // Generate a temporary reference for PDF naming before the loop
    const tempRef = await this.generateCaseReference();
    const filePath = await this.pdfStorageHandler.handlePdfStorage(
      intakeDto.attachment,
      tempRef,
      !!fyiClient,
    );

    const caseReferences: string[] = [];
    let firstCase = true;

    for (const prop of intakeDto.properties) {
      const property = await this.createProperty(client.id, prop);

      if (!prop.create_dispute) {
        continue;
      }

      // Reuse tempRef for the first dispute case, generate new ones for subsequent
      const caseReference = firstCase ? tempRef : await this.generateCaseReference();
      firstCase = false;

      const notice = await this.createValuationNotice(property.id, filePath, prop.valuation_notice, intakeDto.valuationYear);
      const disputeCase = await this.createDisputeCase(client, property.id, notice.id, caseReference, prop.state, prop.valuation_notice.assessed_land_value, intakeDto);

      await this.createLegalGrounds(disputeCase.id, intakeDto.grounds);
      caseReferences.push(caseReference);
    }

    if (caseReferences.length > 0) {
      await this.notifyInternalAssessor(caseReferences, intakeDto.accountantId);
    }

    return { case_references: caseReferences };
  }

  private async createProperty(clientId: string, prop: IntakePropertyDto): Promise<Property> {
    const property = this.propertiesRepository.create({
      client_id: clientId,
      address: prop.address,
      suburb: prop.address.split(',')[1]?.trim() || '',
      state: prop.state,
      postcode: '',
      ownership_pct: prop.ownership_pct,
    });
    return this.propertiesRepository.save(property);
  }

  private async createValuationNotice(
    propertyId: string,
    filePath: string | null,
    valuationNotice: IntakeValuationNoticeDto,
    valuationYear: string,
  ): Promise<ValuationNotice> {
    const notice = this.valuationNoticesRepository.create({
      property_id: propertyId,
      valuation_date: new Date(valuationNotice.valuation_date),
      assessed_land_value: valuationNotice.assessed_land_value,
      notice_reference: `INTAKE-${valuationYear}-${Date.now()}`,
      file_path: filePath,
    });
    return this.valuationNoticesRepository.save(notice);
  }

  private async createDisputeCase(
    client: any,
    propertyId: string,
    valuationNoticeId: string,
    caseReference: string,
    jurisdiction: Jurisdiction,
    assessedLandValue: number,
    intakeDto: CreateDisputeIntakeDto,
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
