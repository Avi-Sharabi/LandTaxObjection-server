import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FyiUploadDto {
  @ApiProperty({
    description: 'Base64-encoded PDF file content',
    example: 'JVBERi0xLjQK...',
  })
  @IsString()
  @IsNotEmpty()
  base64: string;

  @ApiProperty({
    description: 'Unique document identifier — used as the PDF filename and name prefix in FYI',
    example: 'DOC-2024-001',
  })
  @IsString()
  @IsNotEmpty()
  document_id: string;

  @ApiPropertyOptional({
    description: 'Display name shown in FYI. Defaults to "{document_id} Valuation Notice"',
    example: 'DOC-2024-001 Land Tax Assessment',
  })
  @IsOptional()
  @IsString()
  document_name?: string;

  @ApiPropertyOptional({
    description: 'FYI client code override. Defaults to the FYI_CLIENT_CODE environment variable',
    example: 'XPM-CLIENT-123',
  })
  @IsOptional()
  @IsString()
  client_code?: string;
}
