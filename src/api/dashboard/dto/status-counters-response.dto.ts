import { ApiProperty } from '@nestjs/swagger';
import { DisputeStatus } from '../../dispute-cases/entities/dispute-case.entity';

export class StatusCounterItemDto {
  @ApiProperty({ enum: DisputeStatus })
  status: DisputeStatus;

  @ApiProperty({ example: 12 })
  count: number;

  @ApiProperty({ example: 'Draft' })
  label: string;
}

export class StatusCountersResponseDto {
  @ApiProperty({ type: [StatusCounterItemDto] })
  counters: StatusCounterItemDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 74, description: 'Average evidence_strength_score across all active (non-closed) cases that have a score set. Returns 0 when no scored cases exist.' })
  avg_evidence_score: number;
}
