import { IsOptional, IsInt, Min, Max, IsString, MaxLength, IsEnum, IsIn } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ClientStatus } from '../../api/clients/entities/client.entity';
import { DisputeStatus, Jurisdiction } from '../../api/dispute-cases/entities/dispute-case.entity';

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
  @Transform(({ value }) => value?.trim())
  search?: string;
}

export class GetClientsQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @IsString()
  region?: string;
}

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
