import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DecisionOutcome } from '../../valuation-notices/entities/valuation-notice.entity';
import { OwnershipType } from '../../../common/enums/ownership-type.enum';

export class ValuationNoticeNestedDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  valuation_date: Date;

  @ApiPropertyOptional({ nullable: true })
  assessed_land_value: number | null;

  @ApiPropertyOptional({ nullable: true })
  prior_land_value: number | null;

  @ApiPropertyOptional({ nullable: true })
  land_value_2yr_prior: number | null;

  @ApiPropertyOptional({ enum: OwnershipType, nullable: true })
  ownership_type: OwnershipType | null;

  @ApiProperty()
  is_foreign: boolean;

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
