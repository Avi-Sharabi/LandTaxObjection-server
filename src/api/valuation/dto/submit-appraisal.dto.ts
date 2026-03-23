import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsPositive, IsOptional, IsString } from 'class-validator';

export class SubmitAppraisalDto {
  @ApiProperty({ description: 'UUID of the dispute case', example: 'uuid-here' })
  @IsUUID()
  dispute_case_id: string;

  @ApiProperty({ description: 'UUID of the valuation notice', example: 'uuid-here' })
  @IsUUID()
  valuation_notice_id: string;

  @ApiProperty({ description: "Analyst's appraised land value (AUD)", example: 480000 })
  @IsNumber()
  @IsPositive()
  appraised_value: number;

  @ApiPropertyOptional({ description: "Analyst notes on the appraisal", example: 'Market evidence supports lower valuation.' })
  @IsOptional()
  @IsString()
  analyst_notes?: string;
}
