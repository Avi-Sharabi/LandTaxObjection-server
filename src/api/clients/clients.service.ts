import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { XpmService } from 'src/common/xpm/xpm.service';
import { DataSource, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { User } from '../users/entities/user.entity';
import { AcceptTCDto } from './dto/accept-tc.dto';
import { AcceptTcResponseDto } from './dto/accept-tc-response.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { GetClientsQueryDto } from '../../common/dto/paginated-query.dto';
import { PaginatedClientsResponseDto } from '../../common/dto/paginated-response.dto';
import { Client, ClientStatus } from './entities/client.entity';
import { DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';
import { fyiStorageService } from 'src/common/fyi-storage/fyi-storage.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClientsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Client)
    private clientsRepository: Repository<Client>,
    @InjectRepository(DisputeCase)
    private disputeCasesRepository: Repository<DisputeCase>,
    @InjectRepository(ValuationNotice)
    private valuationNoticesRepository: Repository<ValuationNotice>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly azureBlobService: AzureBlobService,
    private readonly fyiStorageService: fyiStorageService,
    private readonly config: ConfigService,
    private readonly xpmService: XpmService,
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

  async findPaginated(query: GetClientsQueryDto): Promise<PaginatedClientsResponseDto> {
    const { page, limit, search, status, region } = query;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Client>[] = [];

    if (search) {
      where.push(
        { ...(status && { status }), ...(region && { region }), name: ILike(`%${search}%`) },
        { ...(status && { status }), ...(region && { region }), email: ILike(`%${search}%`) },
      );
    } else {
      where.push({ ...(status && { status }), ...(region && { region }) });
    }

    const [data, total] = await this.clientsRepository.findAndCount({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        region: true,
        status: true,
        created_at: true,
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
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

  async acceptTc(id: string, _acceptTCDto: AcceptTCDto): Promise<AcceptTcResponseDto> {
    const client = await this.findOne(id);

    const assessorEmail = this.config.get<string>('ASSESSOR_EMAIL');
    const assessor = await this.usersRepository.findOne({ where: { email: assessorEmail } });

    client.tc_accepted_at = new Date();
    client.status = ClientStatus.ACTIVE;

    const xpmMeta = await this.xpmService.createClientInXpm(client);
    if (xpmMeta) {
      Object.assign(client, xpmMeta);
    }

    await this.clientsRepository.save(client);

    const disputeCases = await this.disputeCasesRepository.find({
      where: { client: { id } },
    });

    if (!disputeCases.length) {
      return {
        tcAccepted: true,
        newStatus: client.status,
      };
    }

    for (const disputeCase of disputeCases) {
      if (assessor) disputeCase.assigned_accountant_id = assessor.id;
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
      isFyiProdEnabled
        ? await this.fyiStorageService.uploadToFyi({ base64 }, 'Land Tax Assessment Notice')
        : this.azureBlobService.uploadToFyiDev(base64, documentId);
    }

    return {
      tcAccepted: true,
      newStatus: client.status,
    };
  }

  async remove(id: string, deletedById: string): Promise<{ message: string }> {
    const exists = await this.clientsRepository.findOne({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Client #${id} not found`);

    const now = new Date();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .update(DisputeCase)
        .set({ deleted_at: now, deleted_by: deletedById })
        .where('client_id = :id AND deleted_at IS NULL', { id })
        .execute();

      const clientResult = await queryRunner.manager
        .createQueryBuilder()
        .update(Client)
        .set({ deleted_at: now, deleted_by: deletedById })
        .where('id = :id AND deleted_at IS NULL', { id })
        .execute();

      if (!clientResult.affected) {
        throw new ConflictException(`Client #${id} is already deleted`);
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    return { message: `Client #${id} has been deleted` };
  }
}
