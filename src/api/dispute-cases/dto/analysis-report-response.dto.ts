import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalysisReportResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  case_reference: string;

  @ApiPropertyOptional({ nullable: true })
  analysis_report_url: string | null;
}
