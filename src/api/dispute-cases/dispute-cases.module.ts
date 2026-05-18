import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComparablesModule } from '../comparables/comparables.module';
import { Property } from '../properties/entities/property.entity';
import { Client } from '../clients/entities/client.entity';
import { DisputeLegalGround } from '../dispute-legal-grounds/entities/dispute-legal-ground.entity';
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
import { MsGraphModule } from 'src/common/ms-graph/ms-graph.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuditLog } from '../audit-log/entities/audit-log.entity';
import { McpModule } from 'src/mcp/mcp.module';
import { VgEmailMonitorTask } from './vg-email/vg-email-monitor.task';
import { VgEmailAnalysisService } from './vg-email/vg-email-analysis.service';
import { ValuationModule } from '../valuation/valuation.module';
import { DisputeCaseSubscriber } from './dispute-case.subscriber';
import { VGResponseMonitorScheduler } from './vg-response-monitor.scheduler';

@Module({
  imports: [
    HttpModule,
    AzureBlobModule,
    AzureEmailModule,
    ComparablesModule,
    MsGraphModule,
    McpModule,
    AuditLogModule,
    NotificationsModule,
    ValuationModule,
    TypeOrmModule.forFeature([
      DisputeCase,
      AssessmentDocument,
      DisputeLegalGround,
      Property,
      Client,
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
    VgEmailMonitorTask,
    VgEmailAnalysisService,
    VGResponseMonitorScheduler,
    DisputeCaseSubscriber,
  ],
})
export class DisputeCasesModule { }
