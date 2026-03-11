import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDisputeCaseDto } from './dto/create-dispute-case.dto';
import { UpdateDisputeCaseDto } from './dto/update-dispute-case.dto';
import { CreateDisputeIntakeDto } from './dto/create-dispute-intake.dto';
import { DisputeCase, DisputeStatus } from './entities/dispute-case.entity';
import { DisputeLegalGround, LegalGround } from '../dispute-legal-grounds/entities/dispute-legal-ground.entity';
import { Client, ClientStatus } from '../clients/entities/client.entity';
import { Property, Jurisdiction } from '../properties/entities/property.entity';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';

@Injectable()
export class DisputeCasesService {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly azureBlobService: AzureBlobService,
    @InjectRepository(DisputeCase)
    private disputeCasesRepository: Repository<DisputeCase>,
    @InjectRepository(DisputeLegalGround)
    private legalGroundsRepository: Repository<DisputeLegalGround>,
    @InjectRepository(Client)
    private clientsRepository: Repository<Client>,
    @InjectRepository(Property)
    private propertiesRepository: Repository<Property>,
    @InjectRepository(ValuationNotice)
    private valuationNoticesRepository: Repository<ValuationNotice>,
    @InjectRepository(User)
    private usersRepository: Repository<User>
  ) { }

  create(createDisputeCaseDto: CreateDisputeCaseDto) {
    return 'This action adds a new disputeCase';
  }

  /**
   * Main orchestrator for dispute intake submission
   */
  async submitIntakeApplication(intakeDto: CreateDisputeIntakeDto) {
    /**
    * TODO:
    * - check in fyi if client already exists based on email
    * - if client exists, link to existing client record and create new client with
    *    same details but the status will set to ACTIVE
    * - if client does not exist, create new client record with PROSPECT status
    * 
    * - if client exists upload the pdf to FYI and if not upload it to blob storage
    */

    // Step 1: Check if client exists in FYI based on name
    const fyiClientData = await this.searchClientInFyi(intakeDto.fullName);
    const fyiClientExists = fyiClientData && fyiClientData.data && fyiClientData.data.length > 0;

    // Step 2: Check if client exists in our database
    const existingClient = await this.clientsRepository.findOne({
      where: { name: intakeDto.fullName },
    });

    // Step 3: Determine client status and create/update accordingly
    let client: Client;
    let clientStatus: ClientStatus = fyiClientExists ? ClientStatus.ACTIVE : ClientStatus.PROSPECT;

    if (existingClient) {
      // Update existing client with new status
      existingClient.status = clientStatus;
      existingClient.name = intakeDto.fullName;
      client = await this.clientsRepository.save(existingClient);
    } else {
      // Create new client
      client = await this.createClient(intakeDto.fullName,
        intakeDto.email, intakeDto.dirId, clientStatus);
    }

    // Step 4: Continue with property, valuation notice, and dispute case creation
    const property = await this.createProperty(client.id, intakeDto.propAddress, intakeDto.state);
    const pdfStorageUrl = await this.handlePdfStorage(intakeDto.pdfBase64, intakeDto.pdfFileName);
    const valuationNotice = await this.createValuationNotice(property.id, pdfStorageUrl);
    const disputeCase = await this.createDisputeCase(
      client.id,
      property.id,
      valuationNotice.id,
      client.assigned_accountant_id,
      intakeDto.state,
      intakeDto.addNotes,
    );
    await this.createLegalGrounds(disputeCase.id, intakeDto.grounds);

    return this.disputeCasesRepository.findOne({
      where: { id: disputeCase.id },
      relations: ['client', 'property', 'valuation_notice', 'legal_grounds'],
    });
  }

  /**
   * FYI SEARCH ENTITY BY fullName
   */
  private async searchClientInFyi(fullName: string) {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.config.get('FYI_BASE_URL')}/external/entity`,
          {
            metadata: {
              action: { value: 'list' },
              data: {
                name: fullName,
                page: 1,
                per_page: 1,
              },
            },
          },
          {
            headers: {
              'x-fyi-access-id': this.config.get('FYI_ACCESS_ID'),
              'x-fyi-access-secret': this.config.get('FYI_ACCESS_SECRET'),
              'Content-Type': 'application/json',
            },
          }
        )
      );
      return data;
    } catch (error) {
      console.error('Error searching FYI for client:', error.message);
      return null;
    }
  }

  /**
   * Create or find director user
   */
  private async findDirector(id: string): Promise<User> {
    let director = await this.usersRepository.findOne({ where: { id } });

    if (!director) {
      throw new NotFoundException(`Director with ID ${id} not found`);
    }

    return director;
  }

  /**
   * Create or find applicant user - no longer creates user, just returns null
   */
  private async createOrFindApplicant(email: string, name: string): Promise<User | null> {
    // Skip creating applicant as clients are not users in the new schema
    return null;
  }

  /**
   * Create client record
   */
  private async createClient(
    displayName: string,
    email: string,
    accountantId: string | null,
    status: ClientStatus = ClientStatus.PROSPECT,
  ): Promise<Client> {
    const client = this.clientsRepository.create({
      name: displayName,
      contact_email: email,
      assigned_accountant_id: accountantId,
      status,
    });

    return this.clientsRepository.save(client);
  }

  /**
   * Create property record
   */
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

  /**
   * Handle PDF storage (base64 to URL)
   */
  private async handlePdfStorage(base64: string | undefined, fileName: string | undefined): Promise<string | null> {
    if (!base64 || !fileName) {
      return null;
    }

    // Convert base64 to buffer
    const pdfBuffer = Buffer.from(base64, 'base64');

    // Store base64 directly (consider using blob storage in production)
    // In production: await this.azureBlobService.uploadFile(pdfBuffer, fileName);
    const pdfStorageUrl = `data:application/pdf;base64,${base64}`;

    return pdfStorageUrl;
  }

  /**
   * Create valuation notice
   */
  private async createValuationNotice(propertyId: string, pdfStorageUrl: string | null): Promise<ValuationNotice> {
    const valuationDate = new Date();

    const valuationNotice = this.valuationNoticesRepository.create({
      property_id: propertyId,
      valuation_date: valuationDate,
      assessed_land_value: 0,
      notice_reference: `INTAKE-${Date.now()}`,
      blob_storage_url: pdfStorageUrl,
    });

    return this.valuationNoticesRepository.save(valuationNotice);
  }

  /**
   * Create dispute case
   */
  private async createDisputeCase(
    clientId: string,
    propertyId: string,
    valuationNoticeId: string,
    accountantId: string | null,
    jurisdiction: Jurisdiction,
    notes: string | undefined,
  ): Promise<DisputeCase> {
    const valuationDate = new Date();
    const statutoryDeadline = new Date(valuationDate);
    statutoryDeadline.setDate(statutoryDeadline.getDate() + 60);

    const caseReference = this.generateCaseReference(clientId);

    const disputeCase = this.disputeCasesRepository.create({
      case_reference: caseReference,
      client_id: clientId,
      property_id: propertyId,
      valuation_notice_id: valuationNoticeId,
      assigned_accountant_id: accountantId,
      jurisdiction,
      status: DisputeStatus.DRAFT,
      statutory_deadline: statutoryDeadline,
      notes,
    });

    return this.disputeCasesRepository.save(disputeCase);
  }

  /**
   * Create legal grounds for dispute
   */
  private async createLegalGrounds(disputeId: string, grounds: LegalGround[]): Promise<void> {
    if (!grounds || grounds.length === 0) {
      return;
    }

    const legalGrounds = grounds.map((ground) =>
      this.legalGroundsRepository.create({
        dispute_id: disputeId,
        ground,
        validated: false,
      }),
    );

    await this.legalGroundsRepository.save(legalGrounds);
  }

  /**
   * Generate unique case reference
   */
  private generateCaseReference(clientId: string): string {
    const timestamp = Date.now().toString().slice(-6);
    const clientPrefix = clientId.substring(0, 4).toUpperCase();
    return `DISPUTE-${clientPrefix}-${timestamp}`;
  }

  async findAll(): Promise<DisputeCase[]> {
    return this.disputeCasesRepository.find({
      relations: ['client', 'property', 'valuation_notice', 'assigned_accountant', 'assigned_lawyer', 'legal_grounds'],
    });
  }

  async findOne(id: string): Promise<DisputeCase> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id },
      relations: ['client', 'property', 'valuation_notice', 'assigned_accountant', 'assigned_lawyer', 'legal_grounds'],
    });

    if (!disputeCase) {
      throw new NotFoundException(`Dispute case #${id} not found`);
    }

    return disputeCase;
  }

  async update(id: string, updateDisputeCaseDto: UpdateDisputeCaseDto): Promise<DisputeCase> {
    const disputeCase = await this.findOne(id);
    Object.assign(disputeCase, updateDisputeCaseDto);
    return this.disputeCasesRepository.save(disputeCase);
  }

  async remove(id: string): Promise<{ message: string }> {
    const disputeCase = await this.findOne(id);
    await this.disputeCasesRepository.remove(disputeCase);
    return { message: `Dispute case #${id} removed` };
  }
}
