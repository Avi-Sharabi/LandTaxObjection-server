import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FyiUploadArgsDto {
  @IsString()
  @IsNotEmpty()
  base64: string;

  @IsOptional()
  @IsString()
  document_name?: string;
}
