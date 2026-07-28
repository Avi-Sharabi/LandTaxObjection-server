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

  @ApiPropertyOptional({ nullable: true, description: 'One-sentence explanation of the score.' })
  evidence_strength_rationale: string | null;
}
