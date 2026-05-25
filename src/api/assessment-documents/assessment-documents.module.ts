import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureBlobModule } from 'src/common/azure-blob/azure-blob.module';
import { AssessmentDocument } from './entities/assessment-document.entity';
import { AssessmentDocumentsController } from './assessment-documents.controller';
import { AssessmentDocumentsService } from './assessment-documents.service';

@Module({
  imports: [AzureBlobModule, TypeOrmModule.forFeature([AssessmentDocument])],
  controllers: [AssessmentDocumentsController],
  providers: [AssessmentDocumentsService],
  exports: [AssessmentDocumentsService],
})
export class AssessmentDocumentsModule {}
