import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureBlobModule } from 'src/common/azure-blob/azure-blob.module';
import { ComparablesModule } from '../comparables/comparables.module';
import { AssessmentDocumentsModule } from '../assessment-documents/assessment-documents.module';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { DisputeEvidenceIssue } from './entities/dispute-evidence-issue.entity';
import { SupportingEvidenceProcessor, SUPPORTING_EVIDENCE_QUEUE } from './supporting-evidence.processor';
import { SupportingEvidenceQueueService } from './supporting-evidence-queue.service';
import { SupportingEvidenceService } from './supporting-evidence.service';
import { PropertyContextService } from './property-context.service';
import { EplanningApiService } from './shared/eplanning-api.service';
import { ArcgisService } from './shared/arcgis.service';
import { GeocodingService } from './shared/geocoding.service';
import { PuppeteerService } from './shared/puppeteer.service';
import { ClaudeVisionService } from './shared/claude-vision.service';
import { PdfExtractorService } from './shared/pdf-extractor.service';
import { AccessConstraintsService } from './issues/access-constraints.service';
import { PlanningIssuesService } from './issues/planning-issues.service';
import { EnvironmentalImpactsService } from './issues/environmental-impacts.service';
import { EasementsService } from './issues/easements.service';
import { HeritageService } from './issues/heritage.service';
import { ApportionmentService } from './issues/apportionment.service';
import { GroupingService } from './issues/grouping.service';
import { ConcessionService } from './issues/concession.service';
import { OtherService } from './issues/other.service';
import { InspectionService } from './issues/inspection.service';

@Module({
  imports: [
    HttpModule,
    AzureBlobModule,
    ComparablesModule,
    AssessmentDocumentsModule,
    BullModule.registerQueue({ name: SUPPORTING_EVIDENCE_QUEUE }),
    // DisputeCase is registered here directly to avoid a circular dependency with DisputeCasesModule
    TypeOrmModule.forFeature([DisputeCase, DisputeEvidenceIssue]),
  ],
  providers: [
    SupportingEvidenceProcessor,
    SupportingEvidenceQueueService,
    SupportingEvidenceService,
    PropertyContextService,
    EplanningApiService,
    ArcgisService,
    GeocodingService,
    PuppeteerService,
    ClaudeVisionService,
    PdfExtractorService,
    AccessConstraintsService,
    PlanningIssuesService,
    EnvironmentalImpactsService,
    EasementsService,
    HeritageService,
    ApportionmentService,
    GroupingService,
    ConcessionService,
    OtherService,
    InspectionService,
  ],
  exports: [SupportingEvidenceQueueService, SupportingEvidenceService, PropertyContextService, PuppeteerService],
})
export class SupportingEvidenceModule {}
