import { ApiProperty } from '@nestjs/swagger';
import { PackageDocumentDto } from './package-document.dto';

export enum PackageStatus {
  PENDING_INTERNAL_REVIEW = 'pending_internal_review',
  APPROVED = 'approved',
  SENT_TO_CLIENT = 'sent_to_client',
}

export class DocumentsResponseDto {
  @ApiProperty({ enum: PackageStatus })
  packageStatus: PackageStatus;

  @ApiProperty({ type: [PackageDocumentDto] })
  documents: PackageDocumentDto[];
}
