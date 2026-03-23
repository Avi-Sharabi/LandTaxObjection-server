import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateSiteConstraintDto {
  @ApiPropertyOptional({ description: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Updated legal argument' })
  @IsOptional()
  @IsString()
  legal_argument?: string;

  @ApiPropertyOptional({ description: 'Updated Azure Blob Storage URL for the document' })
  @IsOptional()
  @IsString()
  document_blob_url?: string;

  // Added: matches CreateSiteConstraintDto — base64 attachment for file upload via PATCH
  // Required when calling handleAddDoc (upload doc to existing constraint).
  @ApiPropertyOptional({
    description:
      'Raw base64 string of the supporting document. ' +
      'Data URI prefix (e.g. data:application/pdf;base64,) is stripped automatically.',
    example: 'JVBERi0x...',
  })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string') return value;
    return value.includes(',') ? value.split(',')[1] : value;
  })
  @IsOptional()
  @IsString()
  attachment?: string;
}