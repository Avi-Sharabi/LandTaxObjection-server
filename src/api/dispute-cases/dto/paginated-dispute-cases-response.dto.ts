import { DisputeCase } from '../entities/dispute-case.entity';

export class PaginatedDisputeCasesResponseDto {
  data: DisputeCase[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
