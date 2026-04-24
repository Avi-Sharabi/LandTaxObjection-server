import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { AcceptTCDto } from './dto/accept-tc.dto';
import { AcceptTcResponseDto } from './dto/accept-tc-response.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client, ClientStatus } from './entities/client.entity';
import { DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';
import { fyiStorageService } from 'src/common/fyi-storage/fyi-storage.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    @InjectRepository(Client)
    private clientsRepository: Repository<Client>,
    @InjectRepository(DisputeCase)
    private disputeCasesRepository: Repository<DisputeCase>,
    @InjectRepository(ValuationNotice)
    private valuationNoticesRepository: Repository<ValuationNotice>,
    private readonly azureBlobService: AzureBlobService,
    private readonly fyiStorageService: fyiStorageService,
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
  ) {}


  async create(createClientDto: CreateClientDto): Promise<Client> {
    const client = this.clientsRepository.create({
      ...createClientDto,
      status: createClientDto.status || ClientStatus.PROSPECT,
    });
    return this.clientsRepository.save(client);
  }

  async findAll(): Promise<Client[]> {
    return this.clientsRepository.find({
      relations: ['assigned_accountant', 'properties', 'dispute_cases'],
    });
  }

  async findOne(id: string): Promise<Client> {
    const client = await this.clientsRepository.findOne({
      where: { id },
      relations: ['assigned_accountant', 'properties', 'dispute_cases'],
    });

    if (!client) {
      throw new NotFoundException(`Client #${id} not found`);
    }

    return client;
  }

  async update(id: string, updateClientDto: UpdateClientDto): Promise<Client> {
    const client = await this.findOne(id);
    Object.assign(client, updateClientDto);
    return this.clientsRepository.save(client);
  }


  async acceptTc(id: string, acceptTCDto: AcceptTCDto): Promise<AcceptTcResponseDto> {
    const client = await this.findOne(id);
    let xpmRegistered = false;

    client.tc_accepted_at = new Date();
    client.status = ClientStatus.ACTIVE;

    const xpmMeta = await this.createClientInXpm(client);
    if (xpmMeta) {
      Object.assign(client, xpmMeta);
      xpmRegistered = true;
    }

    await this.clientsRepository.save(client);

    const disputeCases = await this.disputeCasesRepository.find({
      where: { client: { id } },
    });

    if (!disputeCases.length) {
      return {
        tcAccepted: true,
        newStatus: client.status,
        xpmRegistered,
        message: 'No dispute case found for this client, but TC accepted and status updated.',
      };
    }

    for (const disputeCase of disputeCases) {
      disputeCase.assigned_accountant_id = acceptTCDto.assigned_accountant_id;
      if (disputeCase.status === DisputeStatus.PENDING_TNC) {
        disputeCase.status = DisputeStatus.DRAFT;
      }
    }
    await this.disputeCasesRepository.save(disputeCases);

    const firstCase = disputeCases[0];
    const valuationNotices = await this.valuationNoticesRepository.findOne({
      where: { id: firstCase.valuation_notice_id },
      relations: ['source_document'],
    });

    const filePath = valuationNotices?.source_document?.file_path ?? null;

    if (filePath) {
      const isFyiProdEnabled = this.config.get('IS_FYI_PROD_ENABLED') === 'true';
      const file = await this.azureBlobService.getFileContent(filePath);
      const base64 = file.toString('base64');
      const documentId = valuationNotices!.source_document.id;
      const fyiDocumentUrl = isFyiProdEnabled
        ? await this.fyiStorageService.uploadToFyi(base64, documentId)
        : this.azureBlobService.uploadToFyiDev(base64, documentId); // simulate FYI
    }

    return {
      tcAccepted: true,
      newStatus: client.status,
      newCaseStatus: firstCase.status,
      xpmRegistered,
    };
  }


  private buildXpmClientXml(client: Client): string {
    const escapeXml = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const tag = (name: string, value: string | null | undefined) =>
      value ? `  <${name}>${escapeXml(value)}</${name}>\n` : '';

    const dob = client.date_of_birth
      ? new Date(client.date_of_birth).toISOString().split('T')[0]
      : null;

    const accountManager = client.xpm_account_manager_uuid
      ? `  <AccountManager><UUID>${client.xpm_account_manager_uuid}</UUID></AccountManager>\n`
      : '';
    const jobManager = client.xpm_job_manager_uuid
      ? `  <JobManager><UUID>${client.xpm_job_manager_uuid}</UUID></JobManager>\n`
      : '';

    return (
      `<Client>\n` +
      tag('Name', client.name) +
      tag('Title', client.title) +
      tag('Gender', client.gender) +
      tag('FirstName', client.first_name) +
      tag('MiddleName', client.middle_name) +
      tag('LastName', client.last_name) +
      tag('Email', client.email) +
      tag('DateOfBirth', dob) +
      tag('Phone', client.phone) +
      tag('Fax', client.fax) +
      tag('Website', client.website) +
      tag('Address', client.address) +
      tag('City', client.city) +
      tag('Region', client.region) +
      tag('PostCode', client.postcode) +
      tag('Country', client.country) +
      tag('PostalAddress', client.postal_address) +
      tag('PostalCity', client.postal_city) +
      tag('PostalRegion', client.postal_region) +
      tag('PostalPostCode', client.postal_postcode) +
      tag('PostalCountry', client.postal_country) +
      tag('ReferralSource', client.referral_source) +
      tag('BusinessNumber', client.business_number) +
      tag('CompanyNumber', client.company_number) +
      tag('TaxNumber', client.tax_number) +
      tag('BusinessStructure', client.business_structure) +
      accountManager +
      jobManager +
      `</Client>`
    );
  }

  private async createClientInXpm(client: Client): Promise<Partial<Client> | null> {
    if (client.xpm_uuid) return null;

    const baseUrl = this.config.get<string>('XPM_BASE_URL');
    if (!baseUrl) return null;

    const xpmHeaders = {
      'Ocp-Apim-Subscription-Key': this.config.get<string>('XPM_SUBSCRIPTION_KEY'),
      'X-Tenant-Id': this.config.get<string>('XPM_TENANT_ID'),
      'X-App-Id': this.config.get<string>('XPM_APP_ID'),
    };

    try {
      const xml = this.buildXpmClientXml(client);
      await firstValueFrom(
        this.httpService.post(
          `${baseUrl}/practicemanager/clients`,
          xml,
          { headers: { 'Content-Type': 'application/xml', ...xpmHeaders } },
        ),
      );
    } catch (err) {
      this.logger.error(`Failed to create client in XPM: ${(err as Error)?.message ?? String(err)}`);
      return null;
    }

    // POST response doesn't reliably return a UUID — search by name to retrieve the created record
    try {
      const searchResponse = await firstValueFrom(
        this.httpService.get(
          `${baseUrl}/practicemanager/clients/search`,
          { params: { query: client.name }, headers: xpmHeaders },
        ),
      );

      const results: any[] = searchResponse.data?.data ?? [];
      if (!results.length) {
        this.logger.warn(`XPM client created for "${client.name}" but not found in search`);
        return null;
      }
      if (results.length > 1) {
        this.logger.warn(`XPM search returned ${results.length} matches for "${client.name}" — using first result`);
      }
      const xpmClient = results[0];

      this.logger.log(`XPM client synced: ${xpmClient.uuid} (${client.name})`);
      return {
        xpm_uuid: xpmClient.uuid ?? null,
        xpm_account_manager_uuid: xpmClient.accountManager?.uuid ?? null,
        xpm_account_manager_name: xpmClient.accountManager?.name ?? null,
        xpm_job_manager_uuid: xpmClient.jobManager?.uuid ?? null,
        xpm_job_manager_name: xpmClient.jobManager?.name ?? null,
        source: 'xpm',
      };
    } catch (err) {
      this.logger.error(`XPM client created but search failed: ${(err as Error)?.message ?? String(err)}`);
      return null;
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    const client = await this.findOne(id);
    await this.clientsRepository.remove(client);
    return { message: `Client #${id} removed` };
  }


}
