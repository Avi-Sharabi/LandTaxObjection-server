import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class FyiAiChatDto {
  @ApiProperty({
    description: 'Natural language instruction for the AI, e.g. "upload all files for LTD-1111 to FYI"',
    example: 'Upload all files related to LTD-1111 to FYI',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;
}
