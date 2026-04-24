import { Client } from '../entities/client.entity';

export type ClientListItem = Pick<Client, 'id' | 'name' | 'email' | 'phone' | 'city' | 'region' | 'status' | 'created_at'>;

export class PaginatedClientsResponseDto {
  data: ClientListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
