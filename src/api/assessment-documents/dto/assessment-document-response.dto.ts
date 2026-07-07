import { ApiProperty } from '@nestjs/swagger';
import { AssessmentDocument } from '../entities/assessment-document.entity';

export class AssessmentDocumentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  client_id: string;

  @ApiProperty({ nullable: true })
  case_id: string | null;

  @ApiProperty()
  document_name: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty({ nullable: true, description: 'Signed Azure Blob URL for inline viewing (30 min)' })
  viewUrl: string | null;

  @ApiProperty({ nullable: true, description: 'Signed Azure Blob URL for download / Save As (30 min)' })
  downloadUrl: string | null;

  static fromEntity(
    doc: AssessmentDocument,
    viewUrl: string | null,
    downloadUrl: string | null,
  ): AssessmentDocumentResponseDto {
    const dto = new AssessmentDocumentResponseDto();
    dto.id = doc.id;
    dto.client_id = doc.client_id;
    dto.case_id = doc.case_id;
    dto.document_name = doc.document_name;
    dto.created_at = doc.created_at;
    dto.viewUrl = viewUrl;
    dto.downloadUrl = downloadUrl;
    return dto;
  }
}
