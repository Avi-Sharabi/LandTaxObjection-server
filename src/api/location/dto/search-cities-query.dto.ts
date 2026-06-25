import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SearchCitiesQueryDto {
  @ApiProperty({ example: 'NSW', description: 'Australian state code (e.g. NSW, VIC, QLD)' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiPropertyOptional({ example: 'bondi', description: 'Search term to filter cities by name or postcode' })
  @IsOptional()
  @IsString()
  q?: string;
}
