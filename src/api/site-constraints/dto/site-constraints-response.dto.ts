import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConstraintType } from '../entities/site-constraints.entity';

export class SiteConstraintResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() dispute_id: string;
  @ApiProperty({ enum: ConstraintType }) constraint_type: ConstraintType;
  @ApiPropertyOptional() description: string | null;
  @ApiPropertyOptional() legal_argument: string | null;
  @ApiPropertyOptional() document_blob_url: string | null;
  @ApiProperty() created_at: Date;
}