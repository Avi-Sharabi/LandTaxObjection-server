import { IsOptional, IsString } from 'class-validator';

export class FyiUploadArgsDto {
  @IsOptional()
  @IsString()
  base64?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  document_name?: string;
}
