import { ApiProperty } from '@nestjs/swagger';

export class EnqueueGenerateResponseDto {
  @ApiProperty({ example: '42', description: 'BullMQ job ID — use to poll GET /comparables/jobs/:jobId/status' })
  jobId: string;

  @ApiProperty({ example: 'queued' })
  status: 'queued';
}
