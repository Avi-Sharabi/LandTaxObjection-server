import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ConstraintType } from '../entities/constraint-type.enum';
import { UploadedByRole } from '../../valuation-notices/entities/valuation-notice-file.entity';

export class ConstraintFileInputDto {
  @ApiProperty({ description: 'Original filename including extension', example: 'heritage-cert.pdf' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Base64-encoded file content. Data URI prefix is stripped automatically.',
    example: 'JVBERi0x...',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.includes(',') ? value.split(',')[1] : value,
  )
  @IsString()
  data: string;
}

export class CreateDisputeConstraintDto {
  @ApiProperty({ description: 'UUID of the dispute case', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  dispute_id: string;

  @ApiProperty({ enum: ConstraintType, description: 'Constraint type' })
  @IsEnum(ConstraintType)
  constraint_type: ConstraintType;

  @ApiPropertyOptional({ description: 'Free-text description of the constraint' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Supporting documents to upload with this constraint (all in one call)',
    type: [ConstraintFileInputDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConstraintFileInputDto)
  files?: ConstraintFileInputDto[];

  @ApiPropertyOptional({ enum: UploadedByRole, description: 'Role of the uploader (required when files provided)' })
  @IsOptional()
  @IsEnum(UploadedByRole)
  uploaded_by_role?: UploadedByRole;
}
