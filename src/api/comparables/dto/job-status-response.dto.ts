import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'unknown';

@Expose()
export class JobStatusResponseDto {
  @ApiProperty({ example: '42' })
  jobId: string;

  @ApiProperty({ enum: ['waiting', 'active', 'completed', 'failed', 'unknown'] })
  status: JobStatus;

  @ApiPropertyOptional({ example: 10, description: 'Number of comparables saved — available when status is completed' })
  savedCount?: number;

  @ApiPropertyOptional({ description: 'Error message — available when status is failed' })
  error?: string;

  @ApiPropertyOptional({ description: 'Job creation timestamp (ms)' })
  createdAt?: number;

  @ApiPropertyOptional({ description: 'Processing start timestamp (ms)' })
  processedAt?: number;

  @ApiPropertyOptional({ description: 'Completion timestamp (ms)' })
  finishedAt?: number;
}
