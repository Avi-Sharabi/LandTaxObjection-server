import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'pol.imbing@ymlgroup.com.au' })
  @Transform(({ value }) => value?.trim().toLowerCase())
  @IsEmail()
  email: string;
}
