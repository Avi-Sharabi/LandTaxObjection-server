import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CreateDisputeIntakeDto } from '../dto/create-dispute-intake.dto';
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

  async submitIntakeApplication(intakeDto: CreateDisputeIntakeDto) {
    const fyiClient = await this.fyiClientHandler.findClientInFyi(intakeDto.email);

    const client = fyiClient
      ? await this.fyiClientHandler.handleExistingClient(intakeDto, fyiClient)
      : await this.fyiClientHandler.handleNewProspect(intakeDto);

    const property = await this.createProperty(client.id, intakeDto.propAddress, intakeDto.state);
    const caseReference = await this.generateCaseReference();

    const filePath = await this.pdfStorageHandler.handlePdfStorage(
      intakeDto.attachment,
      caseReference,
      !!fyiClient,
    );

    const notice = await this.createValuationNotice(property.id, filePath, intakeDto);
    const disputeCase = await this.createDisputeCase(client, property.id, notice.id, caseReference, intakeDto);

    await this.createLegalGrounds(disputeCase.id, intakeDto.grounds);
    //await this.notifyInternalAssessor(caseReference, intakeDto.accountantId);

    return { case_reference: caseReference };
  }

  private async createProperty(
    clientId: string,
    address: string,
    state: Jurisdiction,
  ): Promise<Property> {
    const property = this.propertiesRepository.create({
      client_id: clientId,
      address,
      suburb: address.split(',')[1]?.trim() || '',
      state,
      postcode: '',
    });
    return this.propertiesRepository.save(property);
  }

  private async createValuationNotice(
    propertyId: string,
    filePath: string | null,
    intakeDto: CreateDisputeIntakeDto,
  ): Promise<ValuationNotice> {
    const notice = this.valuationNoticesRepository.create({
      property_id: propertyId,
      valuation_date: new Date(intakeDto.noticeDate),
      assessed_land_value: intakeDto.assessedLandValue,
      notice_reference: `INTAKE-${intakeDto.valuationYear}-${Date.now()}`,
      file_path: filePath,
    });
    return this.valuationNoticesRepository.save(notice);
  }

  private async createDisputeCase(
    client: any,
    propertyId: string,
    valuationNoticeId: string,
    caseReference: string,
    intakeDto: CreateDisputeIntakeDto,
  ): Promise<DisputeCase> {
    const disputeCase = this.disputeCasesRepository.create({
      case_reference: caseReference,
      client_id: client.id,
      property_id: propertyId,
      valuation_notice_id: valuationNoticeId,
      jurisdiction: intakeDto.state,
      status: DisputeStatus.DRAFT,
      statutory_deadline: new Date(intakeDto.statutoryDeadline),
      notes: intakeDto.addNotes,
    });
    return this.disputeCasesRepository.save(disputeCase);
  }

  private async createLegalGrounds(
    disputeId: string,
    grounds: LegalGround[],
  ): Promise<void> {
    if (!grounds?.length) return;
    const legalGrounds = grounds.map((ground) =>
      this.legalGroundsRepository.create({ dispute_id: disputeId, ground, validated: false }),
    );
    await this.legalGroundsRepository.save(legalGrounds);
  }

  private async notifyInternalAssessor(caseReference: string, accountantId: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: accountantId } });
    if (!user) {
      console.warn(`Accountant with ID ${accountantId} not found. Skipping email notification.`);
      return;
    }
    await this.azureEmailService.sendDisputeApplication(caseReference, user.email);
  }

  private async generateCaseReference(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.disputeCasesRepository.count();
    const sequence = (count + 1).toString().padStart(6, '0');
    return `LTD-${year}-${sequence}`;
  }
}