import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AiModule } from 'src/ai/ai.module';
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
import { AssessmentDocumentsModule } from '../assessment-documents/assessment-documents.module';
import { PackageDocument } from '../objection-package/entities/package-document.entity';
import { AzureBlobModule } from 'src/common/azure-blob/azure-blob.module';
import { AzureEmailModule } from 'src/common/azure-email/azure-email.module';
import { DisputeIntakeOrchestrator } from './intake/dispute-intake.orchestrator';
import { XpmClientHandler } from './intake/xpm-client.handler';
import { PdfStorageHandler } from './intake/pdf-storage.handler';
import { DocumentExtractionHandler } from './intake/document-extraction.handler';
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
import { VGResponseMonitorScheduler } from './vg-response-monitor.scheduler';
import { BullModule } from '@nestjs/bullmq';
import { SupportingEvidenceModule } from '../supporting-evidence/supporting-evidence.module';
import { AnalyzeAiQueueService } from './analyze-ai-queue.service';
import { AnalyzeAiProcessor, ANALYZE_AI_QUEUE } from './analyze-ai.processor';
import { DisputeObjectionReason } from './entities/dispute-objection-reason.entity';
import { DisputeAiSnapshot } from './entities/dispute-ai-snapshot.entity';
import { ObjectionReasonMarkdownService } from './objection-reason-markdown.service';
import { ObjectionReasonBrowserService } from './objection-reason-browser.service';
import { ObjectionReasonGeneratorService } from './objection-reason-generator.service';
import { AiPropertySearchService } from './ai-property-search.service';
import { ValuationReportService } from './valuation-report.service';
import { ValuationReportRepository } from './valuation-report.repository';
import { ValuationCtxCacheService } from './valuation-ctx-cache.service';
import { ComparableSale } from '../comparables/entities/comparable-sale.entity';
import { DisputeEvidenceIssue } from '../supporting-evidence/entities/dispute-evidence-issue.entity';

@Module({
  imports: [
    HttpModule,
    AiModule,
    AzureBlobModule,
    AzureEmailModule,
    ComparablesModule,
    SupportingEvidenceModule,
    BullModule.registerQueue({ name: ANALYZE_AI_QUEUE }),
    MsGraphModule,
    McpModule,
    AuditLogModule,
    NotificationsModule,
    ValuationModule,
    AssessmentDocumentsModule,
    TypeOrmModule.forFeature([
      DisputeCase,
      DisputeLegalGround,
      Property,
      Client,
      ValuationNotice,
      User,
      PackageDocument,
      AuditLog,
      DisputeObjectionReason,
      DisputeAiSnapshot,
      ComparableSale,
      DisputeEvidenceIssue,
    ]),
  ],
  controllers: [DisputeCasesController],
  providers: [
    DisputeCasesService,
    AnalyzeAiQueueService,
    AnalyzeAiProcessor,
    ObjectionReasonMarkdownService,
    ObjectionReasonBrowserService,
    ObjectionReasonGeneratorService,
    AiPropertySearchService,
    ValuationReportService,
    ValuationReportRepository,
    ValuationCtxCacheService,
    DisputeIntakeOrchestrator,
    XpmClientHandler,
    PdfStorageHandler,
    DocumentExtractionHandler,
    fyiStorageService,
    ApprovalReminderTask,
    VgEmailMonitorTask,
    VgEmailAnalysisService,
    VGResponseMonitorScheduler,
  ],
})
export class DisputeCasesModule { }
