import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const TITLE_OPTIONS = ['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Prof.'] as const;
const GENDER_OPTIONS = ['Male', 'Female', 'Prefer not to say'] as const;
const AU_PHONE_REGEX = /^\+61\s[23478]\s[\d\s]{6,15}$/;
const AU_MOBILE_REGEX = /^\+61\s4\s[\d\s]{7,10}$/;
const POSTCODE_REGEX = /^[a-zA-Z0-9\s-]{3,10}$/;

export class UpdateClientInfoDto {
  // ─── Identity ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 'John Smith', description: 'Full client name' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Min 2 characters' })
  @MaxLength(100, { message: 'Max 100 characters' })
  name?: string;

  @ApiPropertyOptional({ example: 'client@example.com' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  @MaxLength(255, { message: 'Max 255 characters' })
  email?: string;

  @ApiPropertyOptional({ example: 'Mr.', enum: TITLE_OPTIONS })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsIn(TITLE_OPTIONS, { message: 'Invalid title' })
  @MaxLength(50)
  title?: string;

  @ApiPropertyOptional({ example: 'Male', enum: GENDER_OPTIONS })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsIn(GENDER_OPTIONS, { message: 'Invalid gender' })
  @MaxLength(50)
  gender?: string;

  @ApiPropertyOptional({ example: '1985-06-15', description: 'ISO date string (YYYY-MM-DD)' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsDateString({}, { message: 'Invalid date' })
  date_of_birth?: string;

  // ─── Contact ─────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: '+61 2 98765432', description: 'Australian phone in format +61 [23478] [local]' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsString()
  @MaxLength(25)
  @Matches(AU_PHONE_REGEX, { message: 'Invalid Australian phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: '+61 4 12345678', description: 'Australian mobile in format +61 4 [local]' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsString()
  @MaxLength(25)
  @Matches(AU_MOBILE_REGEX, { message: 'Invalid Australian mobile number' })
  mobile?: string;

  // ─── Home Address ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: '123 George St' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Max 255 characters' })
  address?: string;

  @ApiPropertyOptional({ example: 'Bondi Beach' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Max 100 characters' })
  city?: string;

  @ApiPropertyOptional({ example: 'New South Wales' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Max 100 characters' })
  region?: string;

  @ApiPropertyOptional({ example: '2026', description: 'Alphanumeric postcode, 3–10 chars' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @Matches(POSTCODE_REGEX, { message: 'Invalid postcode' })
  @MaxLength(10, { message: 'Max 10 characters' })
  postcode?: string;

  @ApiPropertyOptional({ example: 'Australia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  // ─── Postal Address ───────────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: '123 George St' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Max 255 characters' })
  postal_address?: string;

  @ApiPropertyOptional({ example: 'Bondi Beach' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Max 100 characters' })
  postal_city?: string;

  @ApiPropertyOptional({ example: 'New South Wales' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Max 100 characters' })
  postal_region?: string;

  @ApiPropertyOptional({ example: '2026', description: 'Alphanumeric postcode, 3–10 chars' })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @Matches(POSTCODE_REGEX, { message: 'Invalid postcode' })
  @MaxLength(10, { message: 'Max 10 characters' })
  postal_postcode?: string;

  @ApiPropertyOptional({ example: 'Australia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  postal_country?: string;
}
