import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TriggerRetentionDto {
  @ApiPropertyOptional({
    description: 'Overrides PSI_RETENTION_DRY_RUN for this call — log what would be deleted without deleting anything.',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
