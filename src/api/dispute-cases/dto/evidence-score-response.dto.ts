import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvidenceScoreResponseDto {
  @ApiProperty()
  dispute_case_id: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Case-level evidence strength, 0-100. Null when the case has no scorable data yet or the ' +
      'scoring call failed — in both cases any previously stored score is left untouched.',
  })
  evidence_strength_score: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Two sections in one string. First the per-group breakdown of the score: four newline-separated ' +
      'lines, "(points) Label - explanation", whose points add up to evidence_strength_score. Then, ' +
      'after a "Recommendations:" marker line, the evidence still to obtain — one line per item, ' +
      '"[+points] Label - action", ordered largest gain first. The marker reads "Recommendations: ' +
      'none" when a run found nothing material left to improve; its absence entirely means no run has ' +
      'produced recommendations for this case, which is a different claim.',
  })
  evidence_strength_rationale: string | null;

  @ApiProperty({
    description:
      'Whether generation of the Evidence Score Report PDF was queued for this case. The score above ' +
      'is unaffected either way — a Redis outage must not turn a successful recompute into an error. ' +
      'Poll GET /dispute-cases/{id}/evidence-score-report/status to know when the PDF is available in ' +
      'the case documents list. No URL is returned here: at enqueue time the new PDF does not exist ' +
      'yet, so any URL would point at the previous generation.',
  })
  evidence_report_queued: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Job id (the dispute case id) when queued; null when the enqueue itself failed.',
  })
  evidence_report_job_id: string | null;
}
