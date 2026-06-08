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
