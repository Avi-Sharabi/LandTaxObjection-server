import { IsOptional, IsInt, Min, Max, IsString, MaxLength, IsEnum, IsIn, IsUUID } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { OmitType } from '@nestjs/swagger';
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

// search is not implemented on the properties list, so it's omitted rather than
// inherited unused — forbidNonWhitelisted then rejects a stray ?search= with a
// 400 instead of silently accepting and ignoring it.
export class GetPropertiesQueryDto extends OmitType(PaginatedQueryDto, ['search'] as const) {
  // IsUUID, not IsString: client_id is a uuid column, so a non-uuid value would
  // reach Postgres and raise a 500 instead of being rejected as a 400.
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
