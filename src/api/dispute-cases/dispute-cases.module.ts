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
import { AzureBlobModule } from 'src/common/azure-blob/azure-blob.module';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';
import { DisputeIntakeOrchestrator } from './intake/dispute-intake.orchestrator';
import { XpmClientHandler } from './intake/xpm-client.handler';
import { PdfStorageHandler } from './intake/pdf-storage.handler';
import { fyiStorageService } from 'src/common/fyi-storage/fyi-storage.service';

@Module({
  imports: [
    HttpModule,
    AzureBlobModule,
    ComparablesModule,
    TypeOrmModule.forFeature([
      DisputeCase,
      AssessmentDocument,
      DisputeLegalGround,
      Client,
      Property,
      ValuationNotice,
      User,
    ]),
  ],
  controllers: [DisputeCasesController],
  providers: [
    DisputeCasesService,
    AzureEmailService,
    DisputeIntakeOrchestrator,
    XpmClientHandler,
    PdfStorageHandler,
    fyiStorageService
  ],
})
export class DisputeCasesModule { }
