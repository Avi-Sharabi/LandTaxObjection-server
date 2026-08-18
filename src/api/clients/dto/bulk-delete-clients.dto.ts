import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ArrayMinSize, ArrayMaxSize } from 'class-validator';

const MAX_BULK_DELETE_IDS = 100;

export class BulkDeleteClientsDto {
  @ApiProperty({
    type: [String],
    description: 'List of client UUIDs to delete',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_DELETE_IDS)
  ids: string[];
}

export class BulkDeleteClientsResultDto {
  @ApiProperty()
  id: string;

  // 'error' is retained for API-contract compatibility only; removeMany runs the
  // whole batch as one transaction, so an unexpected failure now rejects the
  // request rather than marking a single id.
  @ApiProperty({ enum: ['deleted', 'not_found', 'already_deleted', 'error'] })
  status: 'deleted' | 'not_found' | 'already_deleted' | 'error';
}

export class BulkDeleteClientsResponseDto {
  @ApiProperty({ type: [BulkDeleteClientsResultDto] })
  results: BulkDeleteClientsResultDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  deleted: number;

  @ApiProperty()
  skipped: number;
}
