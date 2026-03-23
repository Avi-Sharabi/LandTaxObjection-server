import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { DecisionOutcome } from '../../valuation-notices/entities/valuation-notice.entity';
import { DisputeStatus } from '../../dispute-cases/entities/dispute-case.entity';

@Exclude()
export class AppraisalResponseDto {
  @Expose()
  @ApiProperty({ description: 'Valuation notice UUID' })
  valuation_notice_id: string;

  @Expose()
  @ApiProperty({ description: 'Dispute case UUID' })
  dispute_case_id: string;

  @Expose()
  @ApiProperty({ description: 'VG assessed land value (AUD)', example: 550000 })
  vg_value: number;

  @Expose()
  @ApiProperty({ description: "Analyst's appraised value (AUD)", example: 480000 })
  appraised_value: number;

  @Expose()
  @ApiProperty({ description: 'Delta: vgValue − appraisedValue (positive = in client favour)', example: 70000 })
  valuation_delta: number;

  @Expose()
  @ApiProperty({ enum: DecisionOutcome, description: 'Computed decision outcome' })
  decision_outcome: DecisionOutcome;

  @Expose()
  @ApiPropertyOptional({ description: 'Analyst notes' })
  analyst_notes: string | null;

  @Expose()
  @ApiProperty({ description: 'Updated dispute case status', enum: DisputeStatus })
  dispute_status: DisputeStatus;

  @Expose()
  @ApiProperty({
    description: 'Routing flag indicating the next US step',
    enum: ['US-10', 'US-11'],
    example: 'US-11',
  })
  next_step: 'US-10' | 'US-11';

  @Expose()
  @ApiProperty()
  appraised_at: Date;
}
