import { DisputeCase } from '../entities/dispute-case.entity';

export type DisputeCaseListItem = Pick<DisputeCase, 'id' | 'case_reference' | 'client_id' | 'jurisdiction' | 'status' | 'statutory_deadline' | 'original_assessed_value' | 'vg_follow_up_count' | 'reminder_count' | 'created_at'>;

export class PaginatedDisputeCasesResponseDto {
  data: DisputeCaseListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
