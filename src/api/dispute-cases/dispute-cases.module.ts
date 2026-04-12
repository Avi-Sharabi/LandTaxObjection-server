import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComparablesModule } from '../comparables/comparables.module';
import { Client } from '../clients/entities/client.entity';
import { DisputeLegalGround } from '../dispute-legal-grounds/entities/dispute-legal-ground.entity';
import { Property } from '../properties/entities/property.entity';
import { User } from '../users/entities/user.entity';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';
import { DisputeCasesController } from './dispute-cases.controller';
import { DisputeCasesService } from './dispute-cases.service';
import { DisputeCase } from './entities/dispute-case.entity';
import { AssessmentDocument } from './entities/assessment-document.entity';
import { PackageDocument } from '../objection-package/entities/package-document.entity';
import { AzureBlobModule } from 'src/common/azure-blob/azure-blob.module';
import { AzureEmailModule } from 'src/common/azure-email/azure-email.module';
import { DisputeIntakeOrchestrator } from './intake/dispute-intake.orchestrator';
import { XpmClientHandler } from './intake/xpm-client.handler';
import { PdfStorageHandler } from './intake/pdf-storage.handler';
import { fyiStorageService } from 'src/common/fyi-storage/fyi-storage.service';
import { ApprovalReminderTask } from './approval-reminder.task';
import { VGResponseMonitorScheduler } from './vg-response-monitor.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuditLog } from '../audit-log/entities/audit-log.entity';

@Module({
  imports: [
    HttpModule,
    AzureBlobModule,
    AzureEmailModule,
    ComparablesModule,
    AuditLogModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      DisputeCase,
      AssessmentDocument,
      DisputeLegalGround,
      Client,
      Property,
      ValuationNotice,
      User,
      PackageDocument,
      AuditLog,
    ]),
  ],
  controllers: [DisputeCasesController],
  providers: [
    DisputeCasesService,
    DisputeIntakeOrchestrator,
    XpmClientHandler,
    PdfStorageHandler,
    fyiStorageService,
    ApprovalReminderTask,
    VGResponseMonitorScheduler,
  ],
})
export class DisputeCasesModule {}
