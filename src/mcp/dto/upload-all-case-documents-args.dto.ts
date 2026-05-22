import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UploadAllCaseDocumentsArgsDto {
  @IsOptional()
  @IsString()
  case_reference?: string;

  @IsOptional()
  @IsUUID()
  case_id?: string;
}
