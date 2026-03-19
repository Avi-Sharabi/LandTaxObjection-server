import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class ComparableResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  dispute_case_id: string;

  @Expose()
  @ApiProperty()
  address: string;

  @Expose()
  @ApiProperty()
  sale_date: Date;

  @Expose()
  @ApiProperty()
  sale_price: number;

  @Expose()
  @ApiProperty({ description: 'Estimated value of improvements (buildings, structures) in AUD' })
  estimated_improvements_value: number;

  @Expose()
  @ApiProperty({ description: 'Adjusted land-only value: Sale Price − Improvements' })
  adjusted_land_value: number;

  @Expose()
  @ApiProperty({ nullable: true })
  land_area_sqm: number | null;

  @Expose()
  @ApiProperty({ nullable: true })
  notes: string | null;

  @Expose()
  @ApiProperty()
  created_by_id: string;

  @Expose()
  @ApiProperty()
  created_at: Date;
}
