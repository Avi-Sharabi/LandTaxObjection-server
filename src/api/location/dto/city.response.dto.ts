import { ApiProperty } from '@nestjs/swagger';

export class CityStateDto {
  @ApiProperty({ example: 'New South Wales' })
  name: string;

  @ApiProperty({ example: 'NSW' })
  abbreviation: string;
}

export class CityResponseDto {
  @ApiProperty({ example: 12345 })
  id: number;

  @ApiProperty({ example: 'Bondi Beach' })
  name: string;

  @ApiProperty({ example: '2026' })
  postcode: string;

  @ApiProperty({ type: CityStateDto })
  state: CityStateDto;
}
