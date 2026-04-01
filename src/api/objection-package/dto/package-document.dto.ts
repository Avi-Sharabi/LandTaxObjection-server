import { ApiProperty } from '@nestjs/swagger';
import { PackageDocument, PackageDocumentCategory, PackageDocumentStatus } from '../entities/package-document.entity';

export class PackageDocumentDto {
  @ApiProperty({ description: 'Package document UUID', example: 'b3e1c2a0-0000-0000-0000-000000000001' })
  id: string;

  @ApiProperty({ description: 'Human-readable document name', example: 'Notice of Objection' })
  name: string;

  @ApiProperty({ enum: PackageDocumentCategory })
  category: PackageDocumentCategory;

  @ApiProperty({ enum: PackageDocumentStatus })
  status: PackageDocumentStatus;

  @ApiProperty({ nullable: true, type: Number })
  fileSizeBytes: number | null;

  @ApiProperty({ nullable: true, type: Date })
  generatedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Signed Azure Blob URL for inline viewing (30 min). Null when status is not READY.' })
  viewUrl: string | null;

  @ApiProperty({ nullable: true, description: 'Signed Azure Blob URL for download / Save As (30 min). Null when status is not READY.' })
  downloadUrl: string | null;

  static fromEntity(
    doc: PackageDocument,
    viewUrl: string | null,
    downloadUrl: string | null,
  ): PackageDocumentDto {
    const dto = new PackageDocumentDto();
    dto.id = doc.id;
    dto.name = doc.name;
    dto.category = doc.category;
    dto.status = doc.status;
    dto.fileSizeBytes = doc.file_size_bytes;
    dto.generatedAt = doc.generated_at;
    dto.viewUrl = viewUrl;
    dto.downloadUrl = downloadUrl;
    return dto;
  }
}
