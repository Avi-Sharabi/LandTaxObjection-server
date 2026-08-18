import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureBlobModule } from 'src/common/azure-blob/azure-blob.module';
import { AssessmentDocument } from './entities/assessment-document.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { AuditLog } from '../audit-log/entities/audit-log.entity';
import { AssessmentDocumentsController } from './assessment-documents.controller';
import { AssessmentDocumentsService } from './assessment-documents.service';
import { AssessmentDocumentsRepository } from './assessment-documents.repository';

@Module({
  imports: [
    AzureBlobModule,
    // AuditLog: the reports_uploaded promotion is a system transition written here rather than
    // in DisputeStatusTransitionService (that would be a circular module dependency), so this
    // module writes its own audit row for it.
    TypeOrmModule.forFeature([AssessmentDocument, DisputeCase, AuditLog]),
  ],
  controllers: [AssessmentDocumentsController],
  providers: [AssessmentDocumentsRepository, AssessmentDocumentsService],
  // The repository is exported so DisputeStatusTransitionService can read the reports-uploaded
  // blocker from the same predicate that enforces the gate, rather than re-spelling the SQL.
  exports: [AssessmentDocumentsService, AssessmentDocumentsRepository],
})
export class AssessmentDocumentsModule {}
