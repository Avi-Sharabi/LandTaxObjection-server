import { ApiProperty } from '@nestjs/swagger';
import { IsBase64, IsNotEmpty, IsString } from 'class-validator';

export class ExtractValuationNoticeDto {
  @ApiProperty({
    example: 'JVBERi0xLjQKJeLjz9M...',
    description: 'Base64 encoded PDF content of the valuation notice to extract data from',
  })
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  attachment: string;
}

export class ExtractedPropertyDto {
  @ApiProperty({ example: '1486 ANZAC PDE LITTLE BAY' })
  address: string;

  @ApiProperty({ example: '4522322', description: 'Digits only' })
  PID: string;

  @ApiProperty({ example: 'NSW' })
  State: string;

  @ApiProperty({ example: '100%' })
  ownership: string;

  @ApiProperty({
    example: '1,075,000',
    description:
      "Comma-formatted, the land value for this assessment's tax year (from the matching LAND VALUE(S) column)",
  })
  assessedLandValue: string;
}

export class ValuationNoticeExtractionDto {
  @ApiProperty({ example: '2025-11-03' })
  issueDate: string;

  @ApiProperty({ example: '2025' })
  taxYear: string;

  @ApiProperty({ type: () => ExtractedPropertyDto, isArray: true })
  properties: ExtractedPropertyDto[];
}
