import { Injectable, NotFoundException } from '@nestjs/common';
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
import { User } from '../users/entities/user.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';

@Injectable()
export class DisputeCasesService {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly azureBlobService: AzureBlobService,
    private readonly azureEmailService: AzureEmailService,
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
    private usersRepository: Repository<User>,
  ) { }

  create(createDisputeCaseDto: CreateDisputeCaseDto) {
    return 'This action adds a new disputeCase';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC — Main Orchestrator
  // ─────────────────────────────────────────────────────────────────────────────

  async submitIntakeApplication(intakeDto: CreateDisputeIntakeDto) {
    // Step 2: FYI lookup is done here so the result can be reused
    // for both client resolution and PDF storage routing
    const fyiClient = await this.findClientInFyi(intakeDto.email);

    // Step 3 or 4: resolve client based on FYI result
    const client = fyiClient
      ? await this.handleExistingClient(intakeDto, fyiClient)
      : await this.handleNewProspect(intakeDto);

    const property = await this.createProperty(client.id, intakeDto.propAddress, intakeDto.state);
    const caseReference = await this.generateCaseReference();

    // Route PDF to FYI container or Azure Blob based on client existence
    const filePath = await this.handlePdfStorage(intakeDto.attachment, caseReference, !!fyiClient);
    const notice = await this.createValuationNotice(property.id, filePath, intakeDto);
    const disputeCase = await this.createDisputeCase(client, property.id, notice.id, caseReference, intakeDto);

    await this.createLegalGrounds(disputeCase.id, intakeDto.grounds);
    await this.notifyInternalAssessor(caseReference, intakeDto.accountantId);
    return { case_reference: caseReference };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2 — Search FYI, match by email in contacts[]
  // Returns the matched FYI entity or null
  // ─────────────────────────────────────────────────────────────────────────────

  private async findClientInFyi(email: string): Promise<any | null> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.config.get('FYI_BASE_URL')}/external/entity`,
          {
            metadata: {
              action: { value: 'list' },
              data: { email, page: 1, per_page: 1 },
            },
          },
          {
            headers: {
              'x-fyi-access-id': this.config.get('FYI_ACCESS_ID'),
              'x-fyi-access-secret': this.config.get('FYI_ACCESS_SECRET'),
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const results = data?.results ?? [];

      // Match by email inside contacts[] — FYI email is stored there
      const matched = results.find((entity: any) =>
        entity.contacts?.some((contact: any) =>
          contact.email?.toLowerCase() === email.toLowerCase()
        )
      );

      return matched ?? null;
    } catch (error) {
      console.error('FYI lookup failed:', error.message);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3 — Existing client: use FYI as source of truth for client data
  // ─────────────────────────────────────────────────────────────────────────────

  private async handleExistingClient(
    intakeDto: CreateDisputeIntakeDto,
    fyiClient: any,
  ): Promise<Client> {
    const existing = await this.findClientByEmail(intakeDto.email);
    const mapped = this.mapFyiToClient(fyiClient, ClientStatus.ACTIVE, intakeDto.accountantId);

    if (existing) {
      // Already in our DB — update with latest FYI data
      Object.assign(existing, mapped);
      return this.clientsRepository.save(existing);
    }

    // In FYI but not yet in our DB — create using FYI data
    return this.clientsRepository.save(
      this.clientsRepository.create(mapped),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 4 — New prospect: capture intake info and store as PROSPECT
  // ─────────────────────────────────────────────────────────────────────────────

  private async handleNewProspect(intakeDto: CreateDisputeIntakeDto): Promise<Client> {
    const existing = await this.findClientByEmail(intakeDto.email);

    if (existing) {
      // Already in our DB as prospect — return as-is
      return existing;
    }

    // Brand new — create as PROSPECT using intake form data
    const client = this.clientsRepository.create({
      name: intakeDto.fullName,
      email: intakeDto.email,
      assigned_accountant_id: intakeDto.accountantId,
      status: ClientStatus.PROSPECT,
    });
    return this.clientsRepository.save(client);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FYI → Client Entity Mapper
  // Maps all available FYI fields to our Client entity shape
  // ─────────────────────────────────────────────────────────────────────────────

  private mapFyiToClient(
    fyiClient: any,
    status: ClientStatus,
    accountantId: string | null = null,
  ): Partial<Client> {
    return {
      // Identity — FYI is source of truth
      name: fyiClient.name,
      email: fyiClient.email,
      phone: fyiClient.phone || null,
      mobile: fyiClient.mobile || null,

      // Address
      address: fyiClient.address || null,
      city: fyiClient.city || null,
      region: fyiClient.region || null,
      postcode: fyiClient.postcode || null,
      country: fyiClient.country || null,

      // Business
      business_number: fyiClient.business_number || null,
      company_number: fyiClient.company_number || null,
      client_code: fyiClient.details?.client_code || null,

      // FYI Metadata
      fyi_id: fyiClient.id?.toString() || null,
      fyi_uuid: fyiClient.details?.uuid || null,
      source: fyiClient.source || null,
      source_id: fyiClient.source_id || null,
      fyi_manager_email: fyiClient.manager_user?.email || null,
      fyi_partner_email: fyiClient.partner_user?.email || null,

      // Internal
      status,
      assigned_accountant_id: accountantId,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PDF Storage — routes to FYI or Azure Blob based on client existence
  // ─────────────────────────────────────────────────────────────────────────────

  private async handlePdfStorage(
    base64: string | undefined,
    caseReference: string,
    isFyiClient: boolean,
  ): Promise<string | null> {
    if (!base64) return null;

    if (isFyiClient) {
      return this.uploadToFyi(base64, caseReference);     // existing client → FYI
    }

    return this.uploadToAzureBlob(base64, caseReference); // prospect → Azure Blob
  }

  private async uploadToFyi(
    base64: string,
    caseReference: string,
  ): Promise<string | null> {
    // TODO: implement FYI document upload
    return null;
  }

  private async uploadToAzureBlob(
    base64: string,
    caseReference: string,
  ): Promise<string | null> {
    const blobName = `dispute-cases/${caseReference}/valuation-notice-${Date.now()}.pdf`;
    await this.azureBlobService.uploadFile(blobName, base64);
    return blobName;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DB Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private async findClientByEmail(email: string): Promise<Client | null> {
    return this.clientsRepository.findOne({ where: { email: email } });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Property
  // ─────────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Valuation Notice
  // ─────────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Dispute Case
  // ─────────────────────────────────────────────────────────────────────────────

  private async createDisputeCase(
    client: Client,
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
      assigned_accountant_id: client.assigned_accountant_id,
      jurisdiction: intakeDto.state,
      status: DisputeStatus.DRAFT,
      statutory_deadline: new Date(intakeDto.statutoryDeadline),
      notes: intakeDto.addNotes,
    });
    return this.disputeCasesRepository.save(disputeCase);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Legal Grounds
  // ─────────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Case Reference Generator — LTD-2026-000001
  // ─────────────────────────────────────────────────────────────────────────────

  private async generateCaseReference(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.disputeCasesRepository.count();
    const sequence = (count + 1).toString().padStart(6, '0');
    return `LTD-${year}-${sequence}`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────────────────────────────────────

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

    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
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