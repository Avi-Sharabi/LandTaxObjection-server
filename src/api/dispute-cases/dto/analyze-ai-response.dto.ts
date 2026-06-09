import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeAiEnqueueResponseDto {
  @ApiProperty()
  jobId: string;
}

export class AnalyzeAiStatusResponseDto {
  @ApiProperty()
  jobId: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ required: false, type: String })
  error?: string;

  @ApiProperty()
  createdAt: number;

  @ApiProperty({ required: false, type: Number })
  processedAt?: number;

  @ApiProperty({ required: false, type: Number })
  finishedAt?: number;

  @ApiProperty()
  allCompleted: boolean;
}

export class AnalyzeAiQueueItemDto {
  @ApiProperty()
  jobId: string;

  @ApiProperty()
  caseId: string;

  @ApiProperty()
  caseReference: string;

  @ApiProperty()
  propertyAddress: string;

  @ApiProperty({ enum: ['active', 'waiting', 'completed', 'failed'] })
  status: 'active' | 'waiting' | 'completed' | 'failed';

  @ApiProperty()
  enqueuedAt: number;
}

export class AnalyzeAiQueueResponseDto {
  @ApiProperty({ type: [AnalyzeAiQueueItemDto] })
  jobs: AnalyzeAiQueueItemDto[];

  @ApiProperty()
  total: number;
}
