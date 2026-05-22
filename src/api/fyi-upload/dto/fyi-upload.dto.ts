import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';

export class FyiUploadDto {
  @ApiPropertyOptional({
    description: 'Base64-encoded file content (mutually exclusive with url — provide one)',
    example: 'JVBERi0xLjQK...',
  })
  @IsOptional()
  @IsString()
  base64?: string;

  @ApiPropertyOptional({
    description: 'HTTP/HTTPS URL to fetch the file from, e.g. an Azure Blob SAS URL (mutually exclusive with base64)',
    example: 'https://account.blob.core.windows.net/container/file.pdf?sv=...',
  })
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiPropertyOptional({
    description: 'Display name shown in FYI. Defaults to "Valuation Notice"',
    example: 'DOC-2024-001 Land Tax Assessment',
  })
  @IsOptional()
  @IsString()
  document_name?: string;
}
