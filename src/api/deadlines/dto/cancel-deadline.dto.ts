import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CancelDeadlineDto {
  @ApiProperty({ description: 'Reason for cancelling this deadline' })
  @IsString()
  @MinLength(1)
  reason: string;
}
