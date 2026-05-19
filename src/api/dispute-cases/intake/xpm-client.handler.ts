import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client, ClientStatus } from '../../clients/entities/client.entity';
import { CreateDisputeIntakeDto } from '../dto/create-dispute-intake.dto';

@Injectable()
export class XpmClientHandler {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    @InjectRepository(Client)
    private clientsRepository: Repository<Client>,
  ) { }

  async findClientInXpm(name: string): Promise<any | null> {
    try {
      const baseUrl = this.config.get('XPM_BASE_URL');

      const { data } = await firstValueFrom(
        this.httpService.get(
          `${baseUrl}/practicemanager/clients/search`,
          {
            params: { query: name },
            headers: {
              'Ocp-Apim-Subscription-Key': this.config.get('XPM_SUBSCRIPTION_KEY'),
              'X-Tenant-Id': this.config.get('XPM_TENANT_ID'),
              'X-App-Id': this.config.get('XPM_APP_ID'),
            },
          },
        ),
      );

      const results: any[] = data?.data ?? [];
      return results[0] ?? null;
    } catch (error) {
      console.log(error)
      console.error('XPM lookup failed:', error.message);
      return null;
    }
  }

  async handleExistingClient(
    intakeDto: CreateDisputeIntakeDto,
    xpmClient: any,
  ): Promise<Client> {
    const existing = await this.findClientByName(intakeDto.fullName);
    const mapped = this.mapXpmToClient(xpmClient, ClientStatus.ACTIVE, intakeDto.accountantId);

    if (existing) {
      Object.assign(existing, mapped);
      return this.clientsRepository.save(existing);
    }

    return this.clientsRepository.save(this.clientsRepository.create(mapped));
  }

  async handleNewProspect(intakeDto: CreateDisputeIntakeDto): Promise<Client> {
    const client = this.clientsRepository.create({
      name: intakeDto.fullName,
      email: intakeDto.email,
      assigned_accountant_id: intakeDto.accountantId,
      status: ClientStatus.PROSPECT,
      source: 'intake_form',
    });
    return this.clientsRepository.save(client);
  }

  async findClientByName(name: string): Promise<Client | null> {
    return this.clientsRepository.findOne({ where: { name } });
  }

  private mapXpmToClient(
    xpmClient: any,
    status: ClientStatus,
    accountantId: string | null = null,
  ): Partial<Client> {
    return {
      name: xpmClient.name?.trim() || null,
      title: xpmClient.title || null,
      gender: xpmClient.gender || null,
      first_name: xpmClient.firstName?.trim() || null,
      middle_name: xpmClient.middleName || null,
      last_name: xpmClient.lastName?.trim() || null,
      email: xpmClient.email || null,
      date_of_birth: xpmClient.dateOfBirth ? new Date(xpmClient.dateOfBirth) : null,
      phone: xpmClient.phone || null,
      fax: xpmClient.fax || null,
      website: xpmClient.website || null,
      address: xpmClient.address?.trim() || null,
      city: xpmClient.city || null,
      region: xpmClient.region || null,
      postcode: xpmClient.postCode || null,
      country: xpmClient.country || null,
      postal_address: xpmClient.postalAddress || null,
      postal_city: xpmClient.postalCity || null,
      postal_region: xpmClient.postalRegion || null,
      postal_postcode: xpmClient.postalPostCode || null,
      postal_country: xpmClient.postalCountry || null,
      business_number: xpmClient.businessNumber || null,
      company_number: xpmClient.companyNumber || null,
      tax_number: xpmClient.taxNumber || null,
      business_structure: xpmClient.businessStructure || null,
      tax_agent: xpmClient.taxAgent || null,
      agency_status: xpmClient.agencyStatus || null,
      referral_source: xpmClient.referralSource || null,
      xpm_uuid: xpmClient.uuid || null,
      xpm_account_manager_uuid: xpmClient.accountManager?.uuid || null,
      xpm_account_manager_name: xpmClient.accountManager?.name || null,
      xpm_job_manager_uuid: xpmClient.jobManager?.uuid || null,
      xpm_job_manager_name: xpmClient.jobManager?.name || null,
      source: 'xpm',
      status,
      assigned_accountant_id: accountantId,
    };
  }
}
