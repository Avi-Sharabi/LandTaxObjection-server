import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client, ClientStatus } from '../../clients/entities/client.entity';
import { CreateDisputeIntakeDto } from '../dto/create-dispute-intake.dto';

@Injectable()
export class FyiClientHandler {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    @InjectRepository(Client)
    private clientsRepository: Repository<Client>,
  ) {}

  async findClientInFyi(email: string): Promise<any | null> {
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
      const matched = results.find((entity: any) =>
        entity.contacts?.some((contact: any) =>
          contact.email?.toLowerCase() === email.toLowerCase(),
        ),
      );

      return matched ?? null;
    } catch (error) {
      console.error('FYI lookup failed:', error.message);
      return null;
    }
  }

  async handleExistingClient(
    intakeDto: CreateDisputeIntakeDto,
    fyiClient: any,
  ): Promise<Client> {
    const existing = await this.findClientByEmail(intakeDto.email);
    const mapped = this.mapFyiToClient(fyiClient, ClientStatus.ACTIVE, intakeDto.accountantId);

    if (existing) {
      Object.assign(existing, mapped);
      return this.clientsRepository.save(existing);
    }

    return this.clientsRepository.save(this.clientsRepository.create(mapped));
  }

  async handleNewProspect(intakeDto: CreateDisputeIntakeDto): Promise<Client> {
    const existing = await this.findClientByEmail(intakeDto.email);
    if (existing) return existing;

    const client = this.clientsRepository.create({
      name: intakeDto.fullName,
      email: intakeDto.email,
      assigned_accountant_id: intakeDto.accountantId,
      status: ClientStatus.PROSPECT,
    });
    return this.clientsRepository.save(client);
  }

  async findClientByEmail(email: string): Promise<Client | null> {
    return this.clientsRepository.findOne({ where: { email } });
  }

  private mapFyiToClient(
    fyiClient: any,
    status: ClientStatus,
    accountantId: string | null = null,
  ): Partial<Client> {
    return {
      name: fyiClient.name,
      email: fyiClient.email,
      phone: fyiClient.phone || null,
      mobile: fyiClient.mobile || null,
      address: fyiClient.address || null,
      city: fyiClient.city || null,
      region: fyiClient.region || null,
      postcode: fyiClient.postcode || null,
      country: fyiClient.country || null,
      business_number: fyiClient.business_number || null,
      company_number: fyiClient.company_number || null,
      client_code: fyiClient.details?.client_code || null,
      fyi_id: fyiClient.id?.toString() || null,
      fyi_uuid: fyiClient.details?.uuid || null,
      source: fyiClient.source || null,
      source_id: fyiClient.source_id || null,
      fyi_manager_email: fyiClient.manager_user?.email || null,
      fyi_partner_email: fyiClient.partner_user?.email || null,
      status,
      assigned_accountant_id: accountantId,
    };
  }
}