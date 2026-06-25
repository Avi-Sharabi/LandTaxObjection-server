import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AU_STATES } from '../../../common/enums/australia.constants';

const AU_STATE_CODES = AU_STATES.map((s) => s.state_code);

export class SearchCitiesQueryDto {
  @ApiProperty({ example: 'NSW', description: 'Australian state code (e.g. NSW, VIC, QLD)', enum: AU_STATE_CODES })
  @IsString()
  @IsNotEmpty()
  @IsIn(AU_STATE_CODES, { message: `state must be one of: ${AU_STATE_CODES.join(', ')}` })
  state: string;

  @ApiPropertyOptional({ example: 'bondi', description: 'Search term to filter cities by name or postcode' })
  @IsOptional()
  @IsString()
  q?: string;
}
