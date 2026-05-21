import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateAssessmentDocumentDto } from './create-assessment-document.dto';

export class CreateAssessmentDocumentsBatchDto {
  @ApiProperty({ type: [CreateAssessmentDocumentDto], description: 'Array of documents to create' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAssessmentDocumentDto)
  documents: CreateAssessmentDocumentDto[];
}
