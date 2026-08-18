import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { XpmService } from 'src/common/xpm/xpm.service';
import {
  DataSource,
  FindOptionsWhere,
  ILike,
  In,
  IsNull,
  Repository,
} from 'typeorm';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { User } from '../users/entities/user.entity';
import { AcceptTCDto } from './dto/accept-tc.dto';
import { AcceptTcResponseDto } from './dto/accept-tc-response.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientInfoDto } from './dto/update-client-info.dto';
import {
  BulkDeleteClientsResponseDto,
  BulkDeleteClientsResultDto,
} from './dto/bulk-delete-clients.dto';
import { GetClientsQueryDto } from '../../common/dto/paginated-query.dto';
import { PaginatedClientsResponseDto } from '../../common/dto/paginated-response.dto';
import { Client, ClientStatus } from './entities/client.entity';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';
import { fyiStorageService } from 'src/common/fyi-storage/fyi-storage.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

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

  async findPaginated(
    query: GetClientsQueryDto,
  ): Promise<PaginatedClientsResponseDto> {
    const { page, limit, search, status, region } = query;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Client>[] = [];

    if (search) {
      where.push(
        {
          ...(status && { status }),
          ...(region && { region }),
          name: ILike(`%${search}%`),
        },
        {
          ...(status && { status }),
          ...(region && { region }),
          email: ILike(`%${search}%`),
        },
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

    const totalPages = Math.ceil(total / limit);

    // IN (:...ids) renders as IN () — a syntax error — on an empty array, which an
    // out-of-range page or a search matching nothing produces.
    if (data.length === 0) {
      return { data: [], total, page, limit, totalPages };
    }

    // One grouped aggregate for the whole page rather than a request per client (the
    // problem this exists to fix). QueryBuilder appends dc.deleted_at IS NULL itself
    // (DisputeCase has @DeleteDateColumn) — this is the exact set remove() soft-deletes.
    // COUNT(*)::int casts server-side so pg returns a number, not an int8 string.
    const counts = await this.disputeCasesRepository
      .createQueryBuilder('dc')
      .select('dc.client_id', 'client_id')
      .addSelect('COUNT(*)::int', 'count')
      .where('dc.client_id IN (:...ids)', { ids: data.map((c) => c.id) })
      .groupBy('dc.client_id')
      .getRawMany<{ client_id: string; count: number }>();

    // Clients with no cases are absent from a grouped result entirely, hence ?? 0.
    const countByClientId = new Map(counts.map((r) => [r.client_id, r.count]));
    const withCounts = data.map((c) => ({
      ...c,
      dispute_case_count: countByClientId.get(c.id) ?? 0,
    }));

    return { data: withCounts, total, page, limit, totalPages };
  }

  async findOne(id: string): Promise<Client & { dispute_case_count: number }> {
    const client = await this.clientsRepository.findOne({
      where: { id },
      relations: ['assigned_accountant', 'properties', 'dispute_cases'],
    });

    if (!client) {
      throw new NotFoundException(`Client #${id} not found`);
    }

    // Free — dispute_cases is already loaded above and is already soft-delete
    // filtered (TypeORM appends deleted_at IS NULL to the join for any relation whose
    // entity has @DeleteDateColumn), so this needs no second query.
    return Object.assign(client, {
      dispute_case_count: client.dispute_cases.length,
    });
  }

  async update(
    id: string,
    updateClientDto: UpdateClientInfoDto,
  ): Promise<Client> {
    const client = await this.findOne(id);
    Object.assign(client, updateClientDto);
    return this.clientsRepository.save(client);
  }

  async acceptTc(
    id: string,
    _acceptTCDto: AcceptTCDto,
  ): Promise<AcceptTcResponseDto> {
    const client = await this.findOne(id);

    const assessorEmail = this.config.get<string>('ASSESSOR_EMAIL');
    const assessor = await this.usersRepository.findOne({
      where: { email: assessorEmail },
    });

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

    // Deliberately does not touch case status. `tnc_agreed` is a manual transition driven by
    // PATCH /v1/dispute-cases/:id/status, which stamps tc_accepted_at only if it is still null.
    for (const disputeCase of disputeCases) {
      if (assessor) disputeCase.assigned_accountant_id = assessor.id;
    }
    await this.disputeCasesRepository.save(disputeCases);

    const firstCase = disputeCases[0];
    const valuationNotices = await this.valuationNoticesRepository.findOne({
      where: { id: firstCase.valuation_notice_id },
      relations: ['source_document'],
    });

    const filePath = valuationNotices?.source_document?.file_path ?? null;

    if (filePath) {
      const isFyiProdEnabled =
        this.config.get('IS_FYI_PROD_ENABLED') === 'true';
      const file = await this.azureBlobService.getFileContent(filePath);
      const base64 = file.toString('base64');
      const documentId = valuationNotices!.source_document.id;
      isFyiProdEnabled
        ? await this.fyiStorageService.uploadToFyi(
            { base64 },
            'Land Tax Assessment Notice',
          )
        : this.azureBlobService.uploadToFyiDev(base64, documentId);
    }

    return {
      tcAccepted: true,
      newStatus: client.status,
    };
  }

  // Delegates to removeMany so there is exactly one place that decides lock order
  // (cases before client) and one place that owns the cascade. Two independent
  // implementations previously took those locks in opposite orders — this one
  // client-then-cases, removeMany's old per-id loop cases-then-client — which is a
  // deadlock waiting for a request on each path to hit the same client at once.
  async remove(id: string, deletedById: string): Promise<{ message: string }> {
    const { results } = await this.removeMany([id], deletedById);
    if (results[0].status === 'not_found') {
      throw new NotFoundException(`Client #${id} not found`);
    }
    if (results[0].status === 'already_deleted') {
      throw new ConflictException(`Client #${id} is already deleted`);
    }
    return { message: `Client #${id} has been deleted` };
  }

  async removeMany(
    ids: string[],
    deletedById: string,
  ): Promise<BulkDeleteClientsResponseDto> {
    const uniqueIds = [...new Set(ids)];
    const now = new Date();

    // One transaction for the whole batch: a classification read, then two
    // set-based UPDATEs — instead of a transaction per client (~5 round trips
    // each, unbounded concurrency against a pg pool of 10).
    const results = await this.dataSource.transaction(async (manager) => {
      // withDeleted: true is required — @DeleteDateColumn auto-filters plain finds.
      const rows = await manager.find(Client, {
        where: { id: In(uniqueIds) },
        select: { id: true, deleted_at: true },
        withDeleted: true,
      });
      const deletedAtById = new Map(rows.map((c) => [c.id, c.deleted_at]));
      const liveIds = uniqueIds.filter((id) => deletedAtById.get(id) === null);

      if (liveIds.length > 0) {
        // Cases before client, matching remove()'s only lock order.
        await manager.update(
          DisputeCase,
          { client_id: In(liveIds), deleted_at: IsNull() },
          { deleted_at: now, deleted_by: deletedById },
        );
        await manager.update(
          Client,
          { id: In(liveIds), deleted_at: IsNull() },
          { deleted_at: now, deleted_by: deletedById },
        );
      }

      // Status reflects the classification snapshot, not a re-check after the
      // UPDATE. Under two concurrent deletes of the same id, the loser's UPDATE
      // criteria (deleted_at: IsNull() above) still protects it from being
      // touched twice — but the loser's response here still reports "deleted"
      // rather than "already_deleted". Data is correct either way; only the
      // reported status can be stale, and only across two overlapping requests
      // for the same client, which this accountant-only, non-concurrent UI can't
      // produce today.
      return uniqueIds.map<BulkDeleteClientsResultDto>((id) => ({
        id,
        status: !deletedAtById.has(id)
          ? 'not_found'
          : deletedAtById.get(id) === null
            ? 'deleted'
            : 'already_deleted',
      }));
    });

    const deleted = results.filter((r) => r.status === 'deleted').length;

    return {
      results,
      total: results.length,
      deleted,
      skipped: results.length - deleted,
    };
  }
}
