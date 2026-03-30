import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CloseNoObjectionDto {
  @ApiProperty({
    description: 'Internal assessed land value determined by the assessor (AUD)',
    minimum: 0,
    example: 1200000,
  })
  @IsNumber()
  @Min(0)
  internalAssessmentValue: number;

  @ApiPropertyOptional({
    description: 'Optional assessor notes explaining the closure decision',
    maxLength: 500,
    example: 'Independent appraisal confirms VG value is at or below market. No viable objection grounds.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  assessorNotes?: string;
}
