import { ApiProperty } from '@nestjs/swagger';
import {
  AssessmentDocument,
  AssessmentDocumentType,
} from '../entities/assessment-document.entity';

export class AssessmentDocumentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  client_id: string;

  @ApiProperty({
    nullable: true,
    description: 'Dispute case this document is scoped to, if any',
  })
  dispute_case_id: string | null;

  @ApiProperty()
  document_name: string;

  @ApiProperty({
    enum: AssessmentDocumentType,
    nullable: true,
    description:
      'What kind of report this is. Null for documents uploaded before the type was introduced. ' +
      'Load-bearing, not cosmetic: a case only advances to reports_uploaded once a ' +
      'land_value_search AND a sales_report are on file WITH a stored blob, so a client ' +
      'cannot show the user why a case is stuck without reading this back.',
  })
  document_type: AssessmentDocumentType | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty({
    nullable: true,
    description: 'Signed Azure Blob URL for inline viewing (30 min)',
  })
  viewUrl: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Signed Azure Blob URL for download / Save As (30 min)',
  })
  downloadUrl: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'Filename to save the document as, including extension. Null when no file is stored. ' +
      'Matches the Content-Disposition sent by GET /assessment-documents/:id/content.',
    example: 'Land Tax Assessment Notice.pdf',
  })
  filename: string | null;

  static fromEntity(
    doc: AssessmentDocument,
    viewUrl: string | null,
    downloadUrl: string | null,
    filename: string | null,
  ): AssessmentDocumentResponseDto {
    const dto = new AssessmentDocumentResponseDto();
    dto.id = doc.id;
    dto.client_id = doc.client_id;
    dto.dispute_case_id = doc.dispute_case_id;
    dto.document_name = doc.document_name;
    dto.document_type = doc.document_type;
    dto.created_at = doc.created_at;
    dto.viewUrl = viewUrl;
    dto.downloadUrl = downloadUrl;
    dto.filename = filename;
    return dto;
  }
}
