import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateDatabaseChatDto {
  @ApiProperty({
    description: 'Natural language instruction for the AI, e.g. "Set is_active to false for user john@example.com"',
    example: 'Set is_active to false for the user with email john@example.com',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(2000)
  instruction: string;
}
