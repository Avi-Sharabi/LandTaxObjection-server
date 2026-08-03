import { ApiProperty } from '@nestjs/swagger';

export class EnqueueResponseDto {
  @ApiProperty({ example: 'sweep', description: 'BullMQ job ID — use to poll GET /property-sales/downloads/:jobId/status' })
  jobId: string;

  @ApiProperty({ example: 'queued' })
  status: 'queued';
}
