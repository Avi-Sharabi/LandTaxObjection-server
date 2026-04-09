import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DecisionOutcome } from '../../valuation-notices/entities/valuation-notice.entity';

export class ValuationNoticeNestedDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  valuation_date: Date;

  @ApiPropertyOptional({ nullable: true })
  assessed_land_value: number | null;

  @ApiPropertyOptional({ nullable: true })
  appraised_value: number | null;

  @ApiPropertyOptional({ nullable: true })
  valuation_delta: number | null;

  @ApiPropertyOptional({ enum: DecisionOutcome, nullable: true })
  decision_outcome: DecisionOutcome | null;

  @ApiPropertyOptional({ nullable: true })
  analyst_notes: string | null;

  @ApiPropertyOptional({ nullable: true })
  notice_reference: string | null;

  @ApiPropertyOptional({ nullable: true })
  benchmark_uplift_pct: number | null;

  @ApiProperty()
  is_exempt: boolean;
}
