import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GetCitiesQueryDto {
  @ApiProperty({ example: 'New South Wales', description: 'Australian state name' })
  @IsString()
  @IsNotEmpty()
  state: string;
}
