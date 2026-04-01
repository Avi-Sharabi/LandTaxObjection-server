import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { Notification } from './entities/notification.entity';
import { NotificationResponseDto } from './dto/notification-response.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  async getUnread(userId: string): Promise<NotificationResponseDto[]> {
    const notifications = await this.notificationRepo.find({
      where: { userId, read: false },
      order: { createdAt: 'DESC' },
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
}
