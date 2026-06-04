import { Injectable, MessageEvent, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, LessThan, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { Subject, Observable, merge, interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { GetNotificationsQueryDto } from './dto/get-notifications-query.dto';
import { PaginatedNotificationsResponseDto } from './dto/paginated-notifications-response.dto';

@Injectable()
export class NotificationsService {
  /**
   * Per-user SSE connection registry.
   * A single user may have multiple simultaneous connections (different tabs),
   * so each userId maps to a Set of Subjects rather than a single one.
   */
  private readonly streams = new Map<string, Set<Subject<NotificationResponseDto>>>();

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  async findPaginated(
    userId: string,
    { cursor, limit = 20 }: GetNotificationsQueryDto,
  ): Promise<PaginatedNotificationsResponseDto> {
    const where: FindOptionsWhere<Notification> = { userId };
    if (cursor) {
      where.createdAt = LessThan(new Date(cursor));
    }

    // Fetch one extra to determine whether a next page exists, and count unread in parallel
    const [rows, totalUnread] = await Promise.all([
      this.notificationRepo.find({
        where,
        order: { createdAt: 'DESC' },
        take: limit + 1,
      }),
      this.notificationRepo.count({ where: { userId, read: false } }),
    ]);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);

    const dtos = plainToInstance(NotificationResponseDto, data, {
      excludeExtraneousValues: true,
    });

    const nextCursor = hasMore ? data[data.length - 1].createdAt.toISOString() : null;

    return { data: dtos, nextCursor, hasMore, totalUnread };
  }

  async getUnread(userId: string): Promise<NotificationResponseDto[]> {
    const notifications = await this.notificationRepo.find({
      where: { userId, read: false },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    return plainToInstance(NotificationResponseDto, notifications, {
      excludeExtraneousValues: true,
    });
  }

  async markAsRead(id: string, userId: string): Promise<NotificationResponseDto> {
    const notification = await this.notificationRepo.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    notification.read = true;
    notification.readAt = new Date();

    const saved = await this.notificationRepo.save(notification);

    return plainToInstance(NotificationResponseDto, saved, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Persists a new notification to the database, then pushes it to every open
   * SSE connection for that user. If no connections are open the notification
   * is still saved and will be returned by the next GET /notifications call.
   */
  async create(
    userId: string,
    type: NotificationType,
    message: string,
    caseId?: string,
  ): Promise<NotificationResponseDto> {
    const entity = this.notificationRepo.create({
      userId,
      type,
      message,
      caseId: caseId ?? null,
    });
    const saved = await this.notificationRepo.save(entity);
    const dto = plainToInstance(NotificationResponseDto, saved, {
      excludeExtraneousValues: true,
    });

    this.broadcast(userId, dto);

    return dto;
  }

  /**
   * Saves a notification within an existing EntityManager transaction.
   * Does NOT push to SSE streams — call broadcast() after the transaction commits.
   */
  async createInTransaction(
    manager: EntityManager,
    userId: string,
    type: NotificationType,
    message: string,
    caseId?: string,
  ): Promise<NotificationResponseDto> {
    const repo = manager.getRepository(Notification);
    const entity = repo.create({ userId, type, message, caseId: caseId ?? null });
    const saved = await repo.save(entity);
    return plainToInstance(NotificationResponseDto, saved, { excludeExtraneousValues: true });
  }

  /**
   * Pushes a notification DTO to all open SSE connections for a user.
   * Call this after a transaction commits when using createInTransaction().
   */
  broadcast(userId: string, dto: NotificationResponseDto): void {
    const userStreams = this.streams.get(userId);
    if (userStreams) {
      for (const subject of userStreams) {
        subject.next(dto);
      }
    }
  }

  /**
   * Opens an SSE stream for one client connection.
   *
   * Returns a merged observable of:
   *   - notification events: pushed by create() in real-time
   *   - heartbeat events: every 30 s to prevent Azure App Service's 240 s
   *     idle-timeout from silently killing the TCP connection
   *
   * Also returns a cleanup() function the controller must call when the HTTP
   * request closes or the server is shutting down.
   */
  createStream(userId: string): { observable: Observable<MessageEvent>; cleanup: () => void } {
    const subject = new Subject<NotificationResponseDto>();

    if (!this.streams.has(userId)) {
      this.streams.set(userId, new Set());
    }
    // get() is guaranteed non-null: set() was called above if the key was absent
    const userStreams = this.streams.get(userId) as Set<Subject<NotificationResponseDto>>;
    userStreams.add(subject);

    const notifications$: Observable<MessageEvent> = subject.pipe(
      map((dto) => ({ type: 'notification', data: dto }) as MessageEvent),
    );

    const heartbeat$: Observable<MessageEvent> = interval(30_000).pipe(
      map(() => ({ type: 'heartbeat', data: '' }) as MessageEvent),
    );

    const observable = merge(notifications$, heartbeat$);

    const cleanup = (): void => {
      const userStreams = this.streams.get(userId);
      if (userStreams) {
        userStreams.delete(subject);
        if (userStreams.size === 0) {
          this.streams.delete(userId);
        }
      }
      if (!subject.closed) {
        subject.complete();
      }
    };

    return { observable, cleanup };
  }
}
