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

  @ApiPropertyOptional({
    description: 'Display name shown in FYI. Defaults to "Valuation Notice"',
    example: 'DOC-2024-001 Land Tax Assessment',
  })
  @IsOptional()
  @IsString()
  document_name?: string;
}
