import { IsBoolean, IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TriggerDownloadDto {
  @ApiPropertyOptional({ description: 'Discover and log what would happen; download nothing, write nothing.' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({
    description: 'Overrides PSI_MAX_ARCHIVES_PER_RUN for this call. Capped tighter than the config default as an API-level guardrail.',
    minimum: 1,
    maximum: 52,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  maxArchives?: number;

  @ApiPropertyOptional({ description: 'Only consider candidates whose release date is on or after this YYYY-MM-DD.' })
  @IsOptional()
  @IsDateString()
  sinceReleaseDate?: string;

  @ApiPropertyOptional({
    description:
      'Operator recovery for a republished week. Only honoured together with sinceReleaseDate — resets already-downloaded/failed/quarantined rows in that range back to discovered before running.',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
