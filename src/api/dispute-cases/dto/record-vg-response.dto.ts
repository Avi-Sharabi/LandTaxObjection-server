import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordVgResponseDto {
  @ApiProperty({ description: 'Date the VG response was received', example: '2026-03-15' })
  @IsDateString()
  responseDate: string;

  @ApiPropertyOptional({ description: 'Notes about the VG response', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  responseNotes?: string;

  @ApiPropertyOptional({ description: 'VG lodgment or confirmation reference number', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lodgmentReferenceNumber?: string;
}
