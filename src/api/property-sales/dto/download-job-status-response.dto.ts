import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import type { SweepResult } from '../property-sales-download.service';

export type DownloadJobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'unknown';

@Expose()
export class DownloadJobStatusResponseDto {
  @ApiProperty({ example: 'sweep' })
  jobId: string;

  @ApiProperty({ enum: ['waiting', 'active', 'completed', 'failed', 'unknown'] })
  status: DownloadJobStatus;

  @ApiPropertyOptional({ description: 'The sweep result — available when status is completed' })
  result?: SweepResult;

  @ApiPropertyOptional({ description: 'Error message — available when status is failed' })
  error?: string;

  @ApiPropertyOptional({ description: 'Job creation timestamp (ms)' })
  createdAt?: number;

  @ApiPropertyOptional({ description: 'Processing start timestamp (ms)' })
  processedAt?: number;

  @ApiPropertyOptional({ description: 'Completion timestamp (ms)' })
  finishedAt?: number;
}
