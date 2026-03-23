import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ConstraintType } from '../entities/site-constraints.entity';

export { UpdateSiteConstraintDto } from './update-site-constraints.dto';
// ── CREATE ────────────────────────────────────────────────────────────────────

export class CreateSiteConstraintDto {
  @ApiProperty({
    description: 'UUID of the dispute case this constraint belongs to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  dispute_id: string;

  @ApiProperty({
    description: 'Constraint type — must match the constraint_type DB enum',
    enum: ConstraintType,
    example: ConstraintType.FLOOD_ZONE_100YR,
  })
  @IsEnum(ConstraintType)
  constraint_type: ConstraintType;

  @ApiPropertyOptional({ description: 'Free-text description of the constraint' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Legal argument to attach to this constraint' })
  @IsOptional()
  @IsString()
  legal_argument?: string;

  @ApiPropertyOptional({ description: 'Azure Blob Storage URL of the supporting document' })
  @IsOptional()
  @IsString()
  document_blob_url?: string;

  @ApiPropertyOptional({
  description:
    'Raw base64 string of the supporting document. ' +
    'Data URI prefix (e.g. data:application/pdf;base64,) is stripped automatically. ' +
    'When provided the service uploads the file to Azure Blob Storage and ' +
    'stores the resulting SAS URL in document_blob_url automatically.',
  example: 'JVBERi0x...',
    })
    @Transform(({ value }) => {
      if (!value || typeof value !== 'string') return value;
      return value.includes(',') ? value.split(',')[1] : value;
    })
    @IsOptional()
    @IsString()
    attachment?: string;
}