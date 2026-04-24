import { IsOptional, IsInt, Min, Max, IsString, MaxLength, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ClientStatus } from '../entities/client.entity';

export class GetClientsQueryDto {
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
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @IsString()
  region?: string;
}
