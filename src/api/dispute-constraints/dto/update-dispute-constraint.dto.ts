import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ConstraintFileInputDto } from './create-dispute-constraint.dto';
import { UploadedByRole } from '../../valuation-notices/entities/valuation-notice-file.entity';

export class UpdateDisputeConstraintDto {
  @ApiPropertyOptional({ description: 'Free-text description of the constraint' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'IDs of existing files to keep. Any file not in this list will be deleted from storage and DB. Omit entirely to leave existing files untouched.',
    type: [String],
    format: 'uuid',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  keep_file_ids?: string[];

  @ApiPropertyOptional({
    description: 'New files to upload and attach to this constraint',
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
