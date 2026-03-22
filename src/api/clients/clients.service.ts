import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { Repository } from 'typeorm';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { AcceptTCDto } from './dto/accept-tc.dto';
import { AcceptTcResponseDto } from './dto/accept-tc-response.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client, ClientStatus } from './entities/client.entity';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';
import { fyiStorageService } from 'src/common/fyi-storage/fyi-storage.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClientsService {
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

  ) {


  }

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

    const STATUS_FLOW = {
      [ClientStatus.PROSPECT]: ClientStatus.ACTIVE,
      [ClientStatus.ACTIVE]: ClientStatus.REJECTED,
    };
    const client = await this.findOne(id);
    if (client) {
      client.tc_accepted_at = new Date();

      client.status = ClientStatus.ACTIVE;


      await this.clientsRepository.save(client);
    }
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { client: { id } },
    });
    if (disputeCase) {
      disputeCase.assigned_accountant_id = acceptTCDto.assigned_accountant_id;
      await this.disputeCasesRepository.save(disputeCase);

      const valuationNotices = await this.valuationNoticesRepository.findOne({
        where: { id: disputeCase.valuation_notice_id },
        relations: ['source_document'],
      })

      const filePath = valuationNotices?.source_document?.file_path ?? null;

      if (filePath) {

        const isFyiProdEnabled = this.config.get('IS_FYI_PROD_ENABLED') === 'true';
        const file = await this.azureBlobService.getFileContent(filePath);
        const base64 = file.toString('base64');
        const documentId = valuationNotices!.source_document.id;
        const fyiDocumentUrl = isFyiProdEnabled
          ? await this.fyiStorageService.uploadToFyi(base64, documentId)
          : this.azureBlobService.uploadToFyiDev(base64, documentId); // simulate FYI

        return {
          tcAccepted: true,
          newStatus: client.status,
        };
      }
    }

    return {
      tcAccepted: true,
      newStatus: client.status,
      message: 'No dispute case found for this client, but TC accepted and status updated.',
    };
  }


  async remove(id: string): Promise<{ message: string }> {
    const client = await this.findOne(id);
    await this.clientsRepository.remove(client);
    return { message: `Client #${id} removed` };
  }


}
