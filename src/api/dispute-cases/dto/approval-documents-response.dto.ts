import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApprovalDocumentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  viewUrl: string | null;
}

export class ApprovalDocumentsResponseDto {
  @ApiProperty()
  alreadyApproved: boolean;

  @ApiPropertyOptional()
  propertyAddress?: string;

  @ApiPropertyOptional()
  taxYear?: string;

  @ApiProperty({ type: [ApprovalDocumentDto] })
  documents: ApprovalDocumentDto[];
}
