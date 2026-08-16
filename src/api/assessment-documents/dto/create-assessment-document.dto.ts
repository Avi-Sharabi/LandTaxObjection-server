import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { AssessmentDocumentType } from '../entities/assessment-document.entity';

export class CreateAssessmentDocumentDto {
  @ApiProperty({ description: 'Client UUID this document belongs to' })
  @IsUUID()
  client_id: string;

  @ApiProperty({ description: 'Dispute case UUID this document belongs to' })
  @IsUUID()
  dispute_case_id: string;

  @ApiProperty({
    description:
      'Display name for the document. Forward slashes (/) are not allowed.',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[^/]+$/, {
    message: 'document_name must not contain a forward slash (/)',
  })
  document_name: string;

  @ApiPropertyOptional({
    enum: AssessmentDocumentType,
    description:
      'What kind of document this is. Setting it is what lets the case advance to ' +
      '"Land value and sales report uploaded" — that happens automatically once a ' +
      'land_value_search AND a sales_report are both on file for the case. Omit it if unknown; ' +
      'an unclassified document never triggers the transition.',
  })
  @IsOptional()
  @IsEnum(AssessmentDocumentType)
  document_type?: AssessmentDocumentType;

  @ApiPropertyOptional({
    description:
      'Base64-encoded file content (with or without data URL prefix)',
  })
  @IsOptional()
  @IsString()
  file?: string;
}
