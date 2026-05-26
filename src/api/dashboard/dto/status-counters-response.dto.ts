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
}
