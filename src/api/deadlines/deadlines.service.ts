import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  Not,
  Repository,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { plainToInstance } from 'class-transformer';
import {
  Deadline,
  DeadlineEntityType,
  DeadlinePriority,
  DeadlineStatus,
} from './entities/deadline.entity';
import {
  DeadlineActivityLog,
  DeadlineActivityAction,
} from './entities/deadline-activity-log.entity';
import { DeadlineStatusService } from './deadline-status.service';
import { CreateDeadlineDto } from './dto/create-deadline.dto';
import { UpdateDeadlineDto } from './dto/update-deadline.dto';
import { GetDeadlinesQueryDto } from './dto/get-deadlines-query.dto';
import { DeadlineResponseDto } from './dto/deadline-response.dto';
import { PaginatedResponseDto } from 'src/common/dto/paginated-response.dto';
import { CancelDeadlineDto } from './dto/cancel-deadline.dto';
import {
  DeadlineDashboardCardDto,
  DeadlineDashboardResponseDto,
} from './dto/deadline-dashboard.dto';
import { DeadlineAlreadyExistsException } from './exceptions/deadline-already-exists.exception';
import { DeadlineNotCancellableException } from './exceptions/deadline-not-cancellable.exception';
import { DeadlineNotCompletableException } from './exceptions/deadline-not-completable.exception';
import { DEADLINE_COMPLETED_CASE_STATUSES, MS_PER_DAY, SYSTEM_ACTOR_ID, TERMINAL_STATUSES } from './deadlines.constants';
import { DeadlinesRepository, DashboardRow } from './deadlines.repository';
import { DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';

@Injectable()
export class DeadlinesService {
  private readonly logger = new Logger(DeadlinesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly deadlineStatusService: DeadlineStatusService,
    private readonly deadlinesRepository: DeadlinesRepository,
    @InjectRepository(Deadline)
    private readonly deadlineRepo: Repository<Deadline>,
    @InjectRepository(DeadlineActivityLog)
    private readonly logRepo: Repository<DeadlineActivityLog>,
  ) {}

  async create(dto: CreateDeadlineDto, actorId: string): Promise<DeadlineResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const duplicate = await manager.findOne(Deadline, {
        where: {
          entityId: dto.entityId,
          entityType: dto.entityType,
          deadlineType: dto.deadlineType,
          status: Not(In(TERMINAL_STATUSES)),
        },
      });

      if (duplicate) {
        throw new DeadlineAlreadyExistsException(dto.entityId, dto.deadlineType);
      }

      const dueDate = new Date(dto.dueDate);
      const status = this.deadlineStatusService.computeStatus(dueDate, new Date());

      const deadline = manager.create(Deadline, {
        ...dto,
        dueDate,
        status,
        notes: dto.notes ?? null,
        cancelledAt: null,
        cancellationReason: null,
        completedAt: null,
        createdById: actorId,
        updatedById: null,
      });

      const saved = await manager.save(Deadline, deadline);

      await this.logActivity(
        saved.id,
        DeadlineActivityAction.CREATED,
        actorId,
        `Deadline "${saved.title}" created with status ${status}`,
        undefined,
        manager,
      );

      this.logger.log(`Deadline created: id=${saved.id} entity=${dto.entityId} type=${dto.deadlineType}`);
      return plainToInstance(DeadlineResponseDto, saved, { excludeExtraneousValues: true });
    });
  }

  async findById(id: string): Promise<DeadlineResponseDto> {
    const deadline = await this.deadlineRepo.findOne({ where: { id } });
    if (!deadline) throw new NotFoundException(`Deadline ${id} not found`);
    return plainToInstance(DeadlineResponseDto, deadline, { excludeExtraneousValues: true });
  }

  async findByEntity(
    entityId: string,
    entityType: DeadlineEntityType,
  ): Promise<DeadlineResponseDto[]> {
    const deadlines = await this.deadlineRepo.find({
      where: { entityId, entityType },
      order: { dueDate: 'ASC' },
    });
    return plainToInstance(DeadlineResponseDto, deadlines, { excludeExtraneousValues: true });
  }

  async findPaginated(query: GetDeadlinesQueryDto): Promise<PaginatedResponseDto<DeadlineResponseDto>> {
    const {
      page = 1,
      limit = 10,
      entityId,
      entityType,
      status,
      deadlineType,
      assignedOwnerId,
      priority,
      dueDateStart,
      dueDateEnd,
      sortBy = 'dueDate',
      sortOrder = 'ASC',
    } = query;

    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Deadline> = {};
    if (entityId) where.entityId = entityId;
    if (entityType) where.entityType = entityType;
    if (status) where.status = status;
    if (deadlineType) where.deadlineType = deadlineType;
    if (assignedOwnerId) where.assignedOwnerId = assignedOwnerId;
    if (priority) where.priority = priority;
    if (dueDateStart && dueDateEnd) {
      where.dueDate = Between(new Date(dueDateStart), new Date(dueDateEnd));
    }

    const [data, total] = await this.deadlineRepo.findAndCount({
      where,
      order: { [sortBy]: sortOrder },
      skip,
      take: limit,
    });

    return {
      data: plainToInstance(DeadlineResponseDto, data, { excludeExtraneousValues: true }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(id: string, dto: UpdateDeadlineDto, actorId: string): Promise<DeadlineResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const deadline = await manager.findOne(Deadline, { where: { id } });
      if (!deadline) throw new NotFoundException(`Deadline ${id} not found`);

      // Explicitly apply only mutable fields — entityId, entityType, deadlineType are immutable post-creation.
      // Note: UpdateDeadlineDto inherits these from PartialType(CreateDeadlineDto); guard here prevents misuse.
      const { title, dueDate: rawDueDate, assignedOwnerId, priority, notes } = dto;
      const updatedFields: string[] = [];

      if (title !== undefined) { deadline.title = title; updatedFields.push('title'); }
      if (assignedOwnerId !== undefined) { deadline.assignedOwnerId = assignedOwnerId; updatedFields.push('assignedOwnerId'); }
      if (priority !== undefined) { deadline.priority = priority; updatedFields.push('priority'); }
      if (notes !== undefined) { deadline.notes = notes; updatedFields.push('notes'); }

      if (rawDueDate !== undefined) {
        deadline.dueDate = new Date(rawDueDate);
        deadline.status = this.deadlineStatusService.computeStatus(deadline.dueDate, new Date());
        updatedFields.push('dueDate', 'status');
      }

      deadline.updatedById = actorId;

      const saved = await manager.save(Deadline, deadline);

      await this.logActivity(
        saved.id,
        DeadlineActivityAction.UPDATED,
        actorId,
        `Deadline updated`,
        { fields: updatedFields },
        manager,
      );

      return plainToInstance(DeadlineResponseDto, saved, { excludeExtraneousValues: true });
    });
  }

  async cancel(id: string, dto: CancelDeadlineDto, actorId: string): Promise<DeadlineResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const deadline = await manager.findOne(Deadline, { where: { id } });
      if (!deadline) throw new NotFoundException(`Deadline ${id} not found`);

      if (TERMINAL_STATUSES.includes(deadline.status)) {
        throw new DeadlineNotCancellableException(id);
      }

      deadline.status = DeadlineStatus.CANCELLED;
      deadline.cancelledAt = new Date();
      deadline.cancellationReason = dto.reason;
      deadline.updatedById = actorId;

      const saved = await manager.save(Deadline, deadline);

      await this.logActivity(
        saved.id,
        DeadlineActivityAction.CANCELLED,
        actorId,
        `Deadline cancelled: ${dto.reason}`,
        undefined,
        manager,
      );

      return plainToInstance(DeadlineResponseDto, saved, { excludeExtraneousValues: true });
    });
  }

  async cancelActiveDeadlinesForCase(caseId: string): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const active = await manager.find(Deadline, {
        where: {
          entityId: caseId,
          entityType: DeadlineEntityType.DISPUTE_CASE,
          status: Not(In(TERMINAL_STATUSES)),
        },
        select: ['id'],
      });

      if (!active.length) return;

      const now = new Date();
      const reason = 'Case closed';

      for (const { id } of active) {
        await manager.update(Deadline, id, {
          status: DeadlineStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason: reason,
          updatedById: SYSTEM_ACTOR_ID,
        });

        await this.logActivity(
          id,
          DeadlineActivityAction.CANCELLED,
          SYSTEM_ACTOR_ID,
          `Deadline auto-cancelled: ${reason}`,
          undefined,
          manager,
        );
      }

      this.logger.log(`[DEADLINES] Auto-cancelled ${active.length} deadline(s) for closed case ${caseId}`);
    });
  }

  async complete(id: string, actorId: string): Promise<DeadlineResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const deadline = await manager.findOne(Deadline, { where: { id } });
      if (!deadline) throw new NotFoundException(`Deadline ${id} not found`);

      // Guard against COMPLETED as well — calling complete twice would write duplicate log entries.
      if (TERMINAL_STATUSES.includes(deadline.status)) {
        throw new DeadlineNotCompletableException(id);
      }

      deadline.status = DeadlineStatus.COMPLETED;
      deadline.completedAt = new Date();
      deadline.updatedById = actorId;

      const saved = await manager.save(Deadline, deadline);

      await this.logActivity(
        saved.id,
        DeadlineActivityAction.COMPLETED,
        actorId,
        `Deadline marked as completed`,
        undefined,
        manager,
      );

      return plainToInstance(DeadlineResponseDto, saved, { excludeExtraneousValues: true });
    });
  }

  async getDashboardData(): Promise<DeadlineDashboardResponseDto> {
    const rows = await this.deadlinesRepository.getDashboardRows();
    const now = new Date();
    const cards = rows.map((row) => this.toDashboardCard(row, now));
    return this.bucketDashboardCards(cards);
  }

  async getActivityLogs(deadlineId: string): Promise<DeadlineActivityLog[]> {
    return this.logRepo.find({
      where: { deadlineId },
      order: { createdAt: 'DESC' },
    });
  }

  private toDashboardCard(row: DashboardRow, now: Date): DeadlineDashboardCardDto {
    const dueDate = new Date(row.dueDate);
    const daysUntilDue = Math.round((dueDate.getTime() - now.getTime()) / MS_PER_DAY);
    const isResolved = DEADLINE_COMPLETED_CASE_STATUSES.includes(row.caseStatus as DisputeStatus);
    const deadlineStatus = isResolved
      ? DeadlineStatus.COMPLETED
      : (row.deadlineStatus ?? this.deadlineStatusService.computeStatus(dueDate, now));
    const propertyAddress = [row.address, row.suburb, `${row.state} ${row.postcode}`]
      .filter(Boolean)
      .join(', ');

    return {
      deadlineId: row.deadlineId,
      caseId: row.caseId,
      caseReference: row.caseReference,
      caseStatus: row.caseStatus,
      clientName: row.clientName,
      propertyAddress,
      dueDate,
      daysUntilDue,
      deadlineStatus,
      priority: row.priority as DeadlinePriority,
      assignedOwner: row.assignedOwnerId
        ? { id: row.assignedOwnerId, name: row.assignedOwnerName }
        : null,
    };
  }

  private bucketDashboardCards(cards: DeadlineDashboardCardDto[]): DeadlineDashboardResponseDto {
    const safe = cards.filter(
      (c) => c.deadlineStatus === DeadlineStatus.UPCOMING || c.deadlineStatus === DeadlineStatus.COMPLETED,
    );
    const approaching = cards.filter(
      (c) =>
        c.deadlineStatus === DeadlineStatus.DUE_SOON ||
        c.deadlineStatus === DeadlineStatus.AT_RISK,
    );
    const urgentOverdue = cards.filter((c) => c.deadlineStatus === DeadlineStatus.OVERDUE);

    return {
      safe,
      approaching,
      urgentOverdue,
      counts: {
        safe: safe.length,
        approaching: approaching.length,
        urgentOverdue: urgentOverdue.length,
      },
    };
  }

  private async logActivity(
    deadlineId: string,
    action: DeadlineActivityAction,
    performedBy: string,
    description: string,
    metadata?: Record<string, unknown>,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(DeadlineActivityLog)
      : this.logRepo;

    await repo.insert({
      deadlineId,
      action,
      performedBy,
      description,
      metadata: metadata ?? null,
    } as QueryDeepPartialEntity<DeadlineActivityLog>);
  }
}
