import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import type { PropertySalesArchive } from '../entities/property-sales-archive.entity';

export type ArchiveSummaryItem = Pick<
  PropertySalesArchive,
  | 'id'
  | 'source_url'
  | 'archive_filename'
  | 'release_date'
  | 'status'
  | 'size_bytes'
  | 'sha256'
  | 'entry_count'
  | 'downloaded_at'
  | 'error_code'
  | 'error_message'
>;

export class PaginatedArchivesResponseDto extends PaginatedResponseDto<ArchiveSummaryItem> {}
