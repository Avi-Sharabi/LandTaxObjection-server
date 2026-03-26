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
    nullable: true,
  })
  description: string | null;

  @ApiPropertyOptional({
    description: 'Optional legal argument supporting the constraint',
    nullable: true,
  })
  legal_argument: string | null;

  /**
   * True when at least one supporting document has been uploaded.
   * The raw blob paths and SAS URLs are never exposed in the API response.
   * To get document URLs call GET /constraints/detail/:id/documents — the
   * backend generates fresh short-lived SAS URLs on demand.
   */
  @ApiProperty({
    description: 'Whether at least one supporting document has been uploaded',
    example: true,
  })
  has_document: boolean;

  @ApiProperty({
    description: 'Number of supporting documents uploaded for this constraint',
    example: 2,
  })
  document_count: number;

  @ApiProperty({
    description: 'Timestamp when the constraint was created (UTC)',
    example: '2026-03-23T10:15:30.000Z',
    type: String,
    format: 'date-time',
  })
  created_at: Date;
}