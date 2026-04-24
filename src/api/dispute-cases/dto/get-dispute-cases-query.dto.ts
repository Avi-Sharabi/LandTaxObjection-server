import { IsOptional, IsInt, Min, Max, IsString, MaxLength, IsEnum, IsIn, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { DisputeStatus, Jurisdiction } from '../entities/dispute-case.entity';

export class GetDisputeCasesQueryDto {
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

  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @IsOptional()
  @IsEnum(Jurisdiction)
  jurisdiction?: Jurisdiction;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsIn(['active', 'due_this_week', 'overdue'])
  dashboardFilter?: 'active' | 'due_this_week' | 'overdue';
}
