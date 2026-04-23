import { Client } from '../entities/client.entity';

export class PaginatedClientsResponseDto {
  data: Client[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
