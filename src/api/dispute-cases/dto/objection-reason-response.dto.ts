import { ApiProperty } from '@nestjs/swagger';

export class ObjectionReasonResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  dispute_case_id: string;

  @ApiProperty()
  ground_number: number;

  @ApiProperty()
  label: string;

  @ApiProperty()
  is_tick: boolean;

  @ApiProperty({ nullable: true, type: String })
  concession_type: string | null;

  @ApiProperty({ nullable: true, type: String })
  concession_type_note: string | null;

  @ApiProperty({ nullable: true, type: String })
  analysis: string | null;

  @ApiProperty({ nullable: true, type: [String] })
  evidence_files: string[] | null;

  @ApiProperty()
  run_id: number;

  @ApiProperty()
  created_at: Date;
}
