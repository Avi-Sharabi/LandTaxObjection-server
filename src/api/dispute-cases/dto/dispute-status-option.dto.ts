import { ApiProperty } from '@nestjs/swagger';
import { DisputeStatus } from '../entities/dispute-case.entity';

export class DisputeStatusOptionDto {
  @ApiProperty({
    enum: DisputeStatus,
    description: 'Status value stored on the case',
  })
  value: DisputeStatus;

  @ApiProperty({
    example: 'Objection Submitted/waiting for a VG response',
    description: 'Display label for the dashboard status column and filter',
  })
  label: string;

  @ApiProperty({
    example: 4,
    description: 'Zero-based lifecycle position, for display ordering',
  })
  order: number;
}
