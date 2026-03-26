import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ConstraintType } from '../entities/site-constraints.entity';

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

  /**
   * @deprecated Use `attachments` instead.
   * Kept for backward compatibility — merged into `attachments` automatically.
   */
  @ApiPropertyOptional({
    description: 'Deprecated — use `attachments`. Single base64 document string.',
    example: 'JVBERi0x...',
    deprecated: true,
  })
  @Transform(({ value }) =>
    typeof value === 'string' && value.includes(',') ? value.split(',')[1] : value,
  )
  @IsOptional()
  @IsString()
  attachment?: string;

  @ApiPropertyOptional({
    description:
      'One or more supporting documents as raw base64 strings. ' +
      'Accepts a single string OR an array of strings — both are treated identically. ' +
      'Data URI prefixes (e.g. data:application/pdf;base64,) are stripped automatically. ' +
      'Each file is uploaded to Azure Blob Storage and recorded as a separate document row.',
    oneOf: [
      { type: 'string',  example: 'JVBERi0x...' },
      { type: 'array', items: { type: 'string' }, example: ['JVBERi0x...', 'JVBERi0y...'] },
    ],
  })
  @Transform(({ value, obj }: { value: unknown; obj: Record<string, unknown> }) => {
    // Merge legacy `attachment` (single) + `attachments` (single or array) into one list.
    const fromLegacy  = obj['attachment'] as string | undefined;
    const fromNew: unknown[] = Array.isArray(value) ? value : (value != null ? [value] : []);
    const merged = [...fromNew, ...(fromLegacy ? [fromLegacy] : [])];
    if (merged.length === 0) return undefined;
    // Strip data URI prefixes
    return merged.map((v) =>
      typeof v === 'string' && v.includes(',') ? v.split(',')[1] : v,
    );
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

// PartialType(OmitType(...)) makes every remaining field optional.
// dispute_id and constraint_type are excluded — the route param (:id) identifies
// the record, so neither should be changeable via PATCH.
export class UpdateSiteConstraintDto extends PartialType(
  OmitType(CreateSiteConstraintDto, ['dispute_id', 'constraint_type'] as const),
) {}
