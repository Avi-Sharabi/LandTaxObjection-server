import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GetCitiesQueryDto {
  @ApiProperty({ example: 'NSW', description: 'Australian state code (e.g. NSW, VIC, QLD)' })
  @IsString()
  @IsNotEmpty()
  state: string;
}
