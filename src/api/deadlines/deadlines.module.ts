import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Deadline } from './entities/deadline.entity';
import { DeadlineActivityLog } from './entities/deadline-activity-log.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeadlinesService } from './deadlines.service';
import { DeadlinesRepository } from './deadlines.repository';
import { DeadlineStatusService } from './deadline-status.service';
import { DeadlineSchedulerTask } from './deadline-scheduler.task';
import { DeadlineNotificationTask } from './deadline-notification.task';
import { DeadlinesController } from './deadlines.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Deadline,
      DeadlineActivityLog,
    ]),
    NotificationsModule,
  ],
  controllers: [DeadlinesController],
  providers: [
    DeadlinesService,
    DeadlinesRepository,
    DeadlineStatusService,
    DeadlineSchedulerTask,
    DeadlineNotificationTask,
  ],
  exports: [DeadlinesService, DeadlineStatusService],
})
export class DeadlinesModule {}
