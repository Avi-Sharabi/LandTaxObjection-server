import { PartialType } from '@nestjs/swagger';
import { CreateAssessmentDocumentDto } from './create-assessment-document.dto';

export class UpdateAssessmentDocumentDto extends PartialType(CreateAssessmentDocumentDto) {}
