import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateResetTokenQueryDto {
  @ApiProperty({ description: 'Password reset token received via email' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
