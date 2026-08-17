import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ArrayMinSize, ArrayMaxSize } from 'class-validator';

const MAX_BULK_DELETE_IDS = 100;

export class BulkDeleteDisputeCasesDto {
  @ApiProperty({
    type: [String],
    description: 'List of dispute case UUIDs to delete',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_DELETE_IDS)
  caseIds: string[];
}

export class BulkDeleteDisputeCasesResultDto {
  @ApiProperty()
  id: string;

  // 'error' is retained for API-contract compatibility only; removeMany no longer
  // loops per id, so an unexpected failure now rejects the whole request instead
  // of marking a single id.
  @ApiProperty({ enum: ['deleted', 'not_found', 'already_deleted', 'error'] })
  status: 'deleted' | 'not_found' | 'already_deleted' | 'error';
}

export class BulkDeleteDisputeCasesResponseDto {
  @ApiProperty({ type: [BulkDeleteDisputeCasesResultDto] })
  results: BulkDeleteDisputeCasesResultDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  deleted: number;

  @ApiProperty()
  skipped: number;
}
