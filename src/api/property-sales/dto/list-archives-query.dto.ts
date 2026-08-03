import { IsIn, IsOptional } from 'class-validator';

import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

const ARCHIVE_STATUSES = [
  'discovered',
  'downloading',
  'downloaded',
  'download_failed',
  'quarantined',
  'loading',
  'loaded',
  'load_failed',
  'deleted',
] as const;

export class ListArchivesQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @IsIn(ARCHIVE_STATUSES)
  status?: (typeof ARCHIVE_STATUSES)[number];
}
