import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureBlobModule } from 'src/common/azure-blob/azure-blob.module';
import { AssessmentDocument } from './entities/assessment-document.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { AssessmentDocumentsController } from './assessment-documents.controller';
import { AssessmentDocumentsService } from './assessment-documents.service';
import { AssessmentDocumentsRepository } from './assessment-documents.repository';

@Module({
  imports: [
    AzureBlobModule,
    TypeOrmModule.forFeature([AssessmentDocument, DisputeCase]),
  ],
  controllers: [AssessmentDocumentsController],
  providers: [AssessmentDocumentsRepository, AssessmentDocumentsService],
  exports: [AssessmentDocumentsService],
})
export class AssessmentDocumentsModule {}
