import { ApiProperty } from '@nestjs/swagger';

export class ValidateResetTokenResponseDto {
  @ApiProperty({ example: true })
  valid: boolean;
}
