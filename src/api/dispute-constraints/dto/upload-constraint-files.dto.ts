import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UploadedByRole } from '../../valuation-notices/entities/valuation-notice-file.entity';
import { ConstraintFileInputDto } from './create-dispute-constraint.dto';

export class UploadConstraintFilesDto {
  @ApiProperty({
    description: 'One or more files to upload in a single call',
    type: [ConstraintFileInputDto],
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConstraintFileInputDto)
  files: ConstraintFileInputDto[];

  @ApiPropertyOptional({ enum: UploadedByRole, description: 'Role of the uploader' })
  @IsOptional()
  @IsEnum(UploadedByRole)
  uploaded_by_role?: UploadedByRole;
}
