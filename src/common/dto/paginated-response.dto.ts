import { Client } from '../../api/clients/entities/client.entity';
import { DisputeCase } from '../../api/dispute-cases/entities/dispute-case.entity';

export class PaginatedResponseDto<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type ClientListItem = Pick<Client, 'id' | 'name' | 'email' | 'phone' | 'city' | 'region' | 'status' | 'created_at'> & {
  dispute_case_count: number;
};

export class PaginatedClientsResponseDto extends PaginatedResponseDto<ClientListItem> { }

export type DisputeCaseListItem = Pick<DisputeCase, 'id' | 'case_reference' | 'client_id' | 'jurisdiction' | 'status' | 'statutory_deadline' | 'original_assessed_value' | 'internal_assessed_value' | 'vg_follow_up_count' | 'reminder_count' | 'is_valuated' | 'created_at'> & {
  client_name: string | null;
  property_address: string;
};

export class PaginatedDisputeCasesResponseDto extends PaginatedResponseDto<DisputeCaseListItem> { }
