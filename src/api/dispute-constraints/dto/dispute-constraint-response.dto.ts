import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConstraintType } from '../entities/constraint-type.enum';

export class ConstraintFileUrlDto {
  @ApiProperty({
    description: 'Unique identifier of the uploaded file',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Short-lived Azure SAS URL for inline viewing in the browser (60-minute expiry). Never cache — fetch fresh on demand.',
    example: 'https://account.blob.core.windows.net/documents/clients/...?sv=...',
  })
  url: string;

  @ApiProperty({
    description: 'Short-lived Azure SAS URL that forces a file download (60-minute expiry). Never cache — fetch fresh on demand.',
    example: 'https://account.blob.core.windows.net/documents/clients/...?sv=...&rscd=attachment%3B+filename%3D...',
  })
  download_url: string;

  @ApiProperty({
    description: 'Original filename as uploaded by the user',
    example: 'heritage-certificate.pdf',
  })
  original_name: string;
}

export class DisputeConstraintResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the dispute constraint',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'UUID of the associated dispute case',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  dispute_id: string;

  @ApiProperty({
    description: 'Type of constraint applied to the property',
    enum: ConstraintType,
    example: ConstraintType.FLOOD_ZONE_100YR,
  })
  constraint_type: ConstraintType;

  @ApiPropertyOptional({
    description: 'Optional free-text description of the constraint',
    nullable: true,
    example: 'Property is within the 100-year flood overlay zone',
  })
  description: string | null;

  @ApiProperty({
    description: 'Supporting files attached to this constraint',
    type: [ConstraintFileUrlDto],
  })
  files: ConstraintFileUrlDto[];

  @ApiProperty({
    description: 'Timestamp when the constraint was created (UTC)',
    example: '2026-03-23T10:15:30.000Z',
    type: String,
    format: 'date-time',
  })
  created_at: Date;
}
