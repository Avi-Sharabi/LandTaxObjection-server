import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConstraintType } from '../../site-constraints/entities/site-constraints.entity';

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

  @ApiPropertyOptional({
    description: 'Disputed land value adjustment in AUD',
    nullable: true,
    example: '150000.00',
  })
  disputed_value: string | null;

  @ApiProperty({
    description: 'Display sort order for ordering constraints in the UI',
    example: 0,
  })
  sort_order: number;

  @ApiProperty({
    description: 'Number of supporting documents uploaded for this constraint',
    example: 2,
  })
  file_count: number;

  @ApiProperty({
    description: 'Whether at least one supporting document has been uploaded',
    example: true,
  })
  has_files: boolean;

  @ApiProperty({
    description: 'Timestamp when the constraint was created (UTC)',
    example: '2026-03-23T10:15:30.000Z',
    type: String,
    format: 'date-time',
  })
  created_at: Date;
}

export class ConstraintFileUrlDto {
  @ApiProperty({
    description: 'Unique identifier of the uploaded file',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Short-lived Azure SAS URL for direct file access (60-minute expiry). Never cache — fetch fresh on demand.',
    example: 'https://account.blob.core.windows.net/documents/clients/...?sv=...',
  })
  url: string;

  @ApiProperty({
    description: 'Original filename as uploaded by the user',
    example: 'heritage-certificate.pdf',
  })
  original_name: string;

  @ApiProperty({
    description: 'MIME type of the uploaded file',
    example: 'application/pdf',
  })
  mime_type: string;
}
