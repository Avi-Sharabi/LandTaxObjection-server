import { ApiProperty } from '@nestjs/swagger';

export class StateResponseDto {
  @ApiProperty({ example: 'New South Wales' })
  name: string;

  @ApiProperty({ example: 'NSW' })
  state_code: string;
}
