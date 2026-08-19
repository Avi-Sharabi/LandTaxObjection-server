import { Client } from '../../api/clients/entities/client.entity';
import { DisputeCase } from '../../api/dispute-cases/entities/dispute-case.entity';
import { Property } from '../../api/properties/entities/property.entity';

export class PaginatedResponseDto<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type ClientListItem = Pick<
  Client,
  | 'id'
  | 'name'
  | 'email'
  | 'phone'
  | 'city'
  | 'region'
  | 'status'
  | 'created_at'
>;

export class PaginatedClientsResponseDto extends PaginatedResponseDto<ClientListItem> {}

export type DisputeCaseListItem = Pick<
  DisputeCase,
  | 'id'
  | 'case_reference'
  | 'client_id'
  | 'jurisdiction'
  | 'status'
  | 'statutory_deadline'
  | 'original_assessed_value'
  | 'internal_assessed_value'
  | 'vg_follow_up_count'
  | 'is_valuated'
  | 'created_at'
> & {
  client_name: string | null;
  property_address: string;
};

export class PaginatedDisputeCasesResponseDto extends PaginatedResponseDto<DisputeCaseListItem> {}

// Every property column is returned as-is; only the relations are trimmed.
// Note: the four `numeric` columns (ownership_pct, land_area_sqm,
// land_area_eplanning_sqm, height_limit_m) have no TypeORM transformer, so pg
// serialises them as strings ("1200.00") despite the entity typing them as
// numbers. The frontend parses and formats them.
export type PropertyListItem = Omit<
  Property,
  'client' | 'valuation_notices' | 'dispute_cases'
> & {
  dispute_cases: Array<Pick<DisputeCase, 'id' | 'case_reference'>>;
};

export class PaginatedPropertiesResponseDto extends PaginatedResponseDto<PropertyListItem> {}
