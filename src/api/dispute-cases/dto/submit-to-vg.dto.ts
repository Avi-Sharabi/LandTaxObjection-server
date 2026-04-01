import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitToVgDto {
  @ApiPropertyOptional({ description: 'Optional notes to include with the submission', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  submissionNotes?: string;
}
