import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

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
}