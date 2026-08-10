import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';

export class AnalyzeAiEnqueueResponseDto {
  @ApiProperty()
  jobId: string;

  @ApiProperty({ example: 'queued' })
  status: string;
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

export class BatchAnalyzeAiRequestDto {
  @ApiProperty({
    type: [String],
    description: 'List of dispute case UUIDs to analyse sequentially',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  caseIds: string[];
}

export class BatchAnalyzeAiItemDto {
  @ApiProperty()
  caseId: string;

  @ApiProperty({ required: false, type: String })
  jobId?: string;

  @ApiProperty({ enum: ['queued', 'skipped', 'error'] })
  status: 'queued' | 'skipped' | 'error';

  @ApiProperty({ required: false, type: String })
  reason?: string;
}

export class BatchAnalyzeAiResponseDto {
  @ApiProperty({ type: [BatchAnalyzeAiItemDto] })
  results: BatchAnalyzeAiItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  queued: number;

  @ApiProperty()
  skipped: number;

  @ApiProperty()
  errors: number;
}
