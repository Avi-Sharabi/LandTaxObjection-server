import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';

export class StatusCountersQueryDto {
  @ApiPropertyOptional({
    description: 'ISO-8601 date — counts records created on or after this date (inclusive)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'ISO-8601 date — counts records created before this date (exclusive)',
    example: '2025-01-01',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'If true, bypasses the Redis cache and forces a fresh DB query',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  force?: boolean;
}
