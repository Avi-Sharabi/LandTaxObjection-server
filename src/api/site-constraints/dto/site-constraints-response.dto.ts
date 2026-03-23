import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConstraintType } from '../entities/site-constraints.entity';

export class SiteConstraintResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the site constraint',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'UUID of the associated dispute case',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  dispute_id: string;

  @ApiProperty({
    description: 'Type of constraint applied to the site',
    enum: ConstraintType,
    example: ConstraintType.FLOOD_ZONE_100YR,
  })
  constraint_type: ConstraintType;

  @ApiPropertyOptional({
    description: 'Optional free-text description of the constraint',
    example: 'Property lies within a designated flood zone',
    nullable: true,
  })
  description: string | null;

  @ApiPropertyOptional({
    description: 'Optional legal argument supporting the constraint',
    example: 'Based on environmental protection regulations',
    nullable: true,
  })
  legal_argument: string | null;

  @ApiPropertyOptional({
    description: 'Azure Blob Storage SAS URL of the supporting document',
    example: 'https://storageaccount.blob.core.windows.net/dispute-cases/constraints/file.pdf?...',
    nullable: true,
  })
  document_blob_url: string | null;

  @ApiProperty({
    description: 'Timestamp when the constraint was created (UTC)',
    example: '2026-03-23T10:15:30.000Z',
    type: String, // Swagger displays Date properly
    format: 'date-time',
  })
  created_at: Date;
}