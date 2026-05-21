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
    description: 'Case reference number — used as the document name in FYI when document_name is not provided',
    example: 'CR-2024-001',
  })
  @IsOptional()
  @IsString()
  case_reference?: string;

  @ApiPropertyOptional({
    description: 'Explicit display name shown in FYI. Overrides case_reference. Defaults to case_reference, then "Valuation Notice"',
    example: 'CR-2024-001 Land Tax Assessment',
  })
  @IsOptional()
  @IsString()
  document_name?: string;
}
