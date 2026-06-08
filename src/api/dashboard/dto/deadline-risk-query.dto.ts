import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum DeadlineRiskLevel {
  SAFE = 'safe',
  DUE_SOON = 'due_soon',
  AT_RISK = 'at_risk',
  OVERDUE = 'overdue',
}

export class GetDeadlineRiskQueryDto {
  @ApiPropertyOptional({
    enum: DeadlineRiskLevel,
    description: 'Narrow to a specific risk level only',
  })
  @IsOptional()
  @IsEnum(DeadlineRiskLevel)
  riskLevel?: DeadlineRiskLevel;
}
