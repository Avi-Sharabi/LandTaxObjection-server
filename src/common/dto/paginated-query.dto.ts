import { IsOptional, IsInt, Min, Max, IsString, MaxLength, IsEnum, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { Client, ClientStatus } from '../../api/clients/entities/client.entity';
import { DisputeCase, DisputeStatus, Jurisdiction } from '../../api/dispute-cases/entities/dispute-case.entity';

// ---------------------------------------------------------------------------
// Base paginated query
// ---------------------------------------------------------------------------

export class PaginatedQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

// ---------------------------------------------------------------------------
// Paginated response base
// ---------------------------------------------------------------------------

export class PaginatedResponseDto<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export type ClientListItem = Pick<Client, 'id' | 'name' | 'email' | 'phone' | 'city' | 'region' | 'status' | 'created_at'>;

export class GetClientsQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @IsString()
  region?: string;
}

export class PaginatedClientsResponseDto extends PaginatedResponseDto<ClientListItem> {}

// ---------------------------------------------------------------------------
// Dispute cases
// ---------------------------------------------------------------------------

export type DisputeCaseListItem = Pick<DisputeCase, 'id' | 'case_reference' | 'client_id' | 'jurisdiction' | 'status' | 'statutory_deadline' | 'original_assessed_value' | 'vg_follow_up_count' | 'reminder_count' | 'created_at'>;

export class GetDisputeCasesQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @IsOptional()
  @IsEnum(Jurisdiction)
  jurisdiction?: Jurisdiction;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsIn(['active', 'due_this_week', 'overdue'])
  dashboardFilter?: 'active' | 'due_this_week' | 'overdue';
}

export class PaginatedDisputeCasesResponseDto extends PaginatedResponseDto<DisputeCaseListItem> {}
