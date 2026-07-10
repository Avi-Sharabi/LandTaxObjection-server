import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateAssessmentDocumentDto {
  @ApiProperty({ description: 'Client UUID this document belongs to' })
  @IsUUID()
  client_id: string;

  @ApiProperty({ description: 'Dispute case UUID this document belongs to' })
  @IsUUID()
  dispute_case_id: string;

  @ApiProperty({ description: 'Display name for the document. Forward slashes (/) are not allowed.' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[^/]+$/, { message: 'document_name must not contain a forward slash (/)' })
  document_name: string;

  @ApiPropertyOptional({ description: 'Base64-encoded file content (with or without data URL prefix)' })
  @IsOptional()
  @IsString()
  file?: string;
}
