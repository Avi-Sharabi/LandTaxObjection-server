import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FyiUploadArgsDto {
  @IsString()
  @IsNotEmpty()
  base64: string;

  @IsString()
  @IsNotEmpty()
  document_id: string;

  @IsOptional()
  @IsString()
  document_name?: string;

  @IsOptional()
  @IsString()
  client_code?: string;
}
