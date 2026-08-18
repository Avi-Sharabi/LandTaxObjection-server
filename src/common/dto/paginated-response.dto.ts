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

export type ClientListItem = Pick<Client, 'id' | 'name' | 'email' | 'phone' | 'city' | 'region' | 'status' | 'created_at'>;

export class PaginatedClientsResponseDto extends PaginatedResponseDto<ClientListItem> { }

export type DisputeCaseListItem = Pick<DisputeCase, 'id' | 'case_reference' | 'client_id' | 'jurisdiction' | 'status' | 'statutory_deadline' | 'original_assessed_value' | 'internal_assessed_value' | 'vg_follow_up_count' | 'reminder_count' | 'is_valuated' | 'created_at'> & {
  client_name: string | null;
  property_address: string;
};

export class PaginatedDisputeCasesResponseDto extends PaginatedResponseDto<DisputeCaseListItem> { }

type PropertyListFields = Pick<
  Property,
  | 'id'
  | 'pid'
  | 'address'
  | 'zoning'
  | 'lot_dp'
  | 'dimensions'
  | 'postcode'
  | 'land_area_sqm'
  | 'land_area_eplanning_sqm'
  | 'ownership_pct'
  | 'height_limit_m'
  | 'created_at'
>;

type PropertyListNullableOverrides =
  | 'pid'
  | 'address'
  | 'zoning'
  | 'postcode'
  | 'land_area_sqm'
  | 'ownership_pct';

export type PropertyListItem = Omit<
  PropertyListFields,
  PropertyListNullableOverrides
> & {
  pid: string | null;
  address: string | null;
  locality: string;
  zoning: string | null;
  postcode: string | null;
  land_area_sqm: number | null;
  land_area_display: string | null;
  land_area_eplanning_display: string | null;
  ownership_pct: number | null;
  ownership_display: string | null;
  height_limit_display: string | null;
  added_display: string;
  cases: Array<Pick<DisputeCase, 'id' | 'case_reference'>>;
};

export class PaginatedPropertiesResponseDto extends PaginatedResponseDto<PropertyListItem> {}
