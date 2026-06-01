import { IsOptional, IsString, IsUUID } from 'class-validator';

export class GetCaseDocumentsArgsDto {
  @IsOptional()
  @IsString()
  case_reference?: string;

  @IsOptional()
  @IsUUID()
  case_id?: string;
}
