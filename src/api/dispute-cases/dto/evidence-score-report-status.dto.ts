import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvidenceScoreReportStatusDto {
  @ApiProperty()
  dispute_case_id: string;

  @ApiPropertyOptional({ nullable: true, description: 'Job id, or null when no job exists for this case.' })
  job_id: string | null;

  @ApiProperty({
    enum: ['waiting', 'active', 'completed', 'failed', 'none'],
    description:
      '"none" means no report job exists for this case — either one has never been queued, or the ' +
      'last one aged out of the queue. It is not an error: the PDF from a completed run stays in the ' +
      'case documents list long after its job is gone.',
  })
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'none';

  @ApiPropertyOptional({ nullable: true, description: 'Failure reason when status is "failed".' })
  error: string | null;
}
