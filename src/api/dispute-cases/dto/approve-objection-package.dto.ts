import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ApproveObjectionPackageDto {
  @ApiProperty({ description: 'UUID approval token from the email link' })
  @IsUUID()
  token: string;
}
