import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LegalGround } from '../../dispute-legal-grounds/entities/dispute-legal-ground.entity';
import { Jurisdiction } from '../../properties/entities/property.entity';

export class IntakeValuationNoticeDto {
  @ApiProperty({ example: 280798, description: 'Assessed land value from the notice' })
  @IsNumber()
  assessed_land_value: number;

  @ApiProperty({ example: '2024-07-01', description: 'Valuation date on the notice' })
  @IsDateString()
  valuation_date: string;
}

export class IntakePropertyDto {
  @ApiProperty({ example: 'Unit 4 25 TERMINUS ST CASTLE HILL', description: 'Property address' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ enum: Jurisdiction, example: 'NSW', description: 'State/jurisdiction' })
  @IsEnum(Jurisdiction)
  state: Jurisdiction;

  @ApiProperty({ example: 100, description: 'Ownership percentage (0–100)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  ownership_pct: number;

  @ApiProperty({ type: () => IntakeValuationNoticeDto })
  @ValidateNested()
  @Type(() => IntakeValuationNoticeDto)
  valuation_notice: IntakeValuationNoticeDto;

  @ApiProperty({
    enum: LegalGround,
    isArray: true,
    description: 'Legal grounds for dispute for this property',
    example: ['incorrect_land_value'],
  })
  @IsArray()
  @IsEnum(LegalGround, { each: true })
  grounds: LegalGround[];

  @ApiProperty({
    isArray: true,
    description: 'Constraint types affecting this property (e.g. "Easements", "Heritage", "Flood Zone")',
    example: ['Easements'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  constraints?: string[];

  @ApiProperty({ example: true, description: 'Whether to create a dispute case for this property', required: false })
  @IsOptional()
  @IsBoolean()
  create_dispute?: boolean;
}

export class CreateDisputeIntakeDto {
  // ─── File Upload ────────────────────────────────────────────────────────────

  @ApiProperty({
    example: 'JVBERi0xLjQKJeLjz9M...',
    description: 'Base64 encoded PDF content (maps to JSON: attachment)',
    required: false,
  })
  @IsOptional()
  @IsString()
  attachment?: string;

  // ─── Applicant Details ──────────────────────────────────────────────────────

  @ApiProperty({ example: 'Jane Smith', description: 'Full name of the applicant' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: 'jane@example.com', description: 'Email address of the applicant' })
  @IsEmail()
  email: string;

  // ─── Properties ─────────────────────────────────────────────────────────────

  @ApiProperty({
    type: () => IntakePropertyDto,
    isArray: true,
    description: 'List of properties included in this intake submission',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntakePropertyDto)
  properties: IntakePropertyDto[];

  // ─── Valuation / Notice Details ─────────────────────────────────────────────

  @ApiProperty({ example: '2026-04-03', description: 'Date on the valuation notice' })
  @IsDateString()
  noticeDate: string;

  @ApiProperty({ example: '2024', description: 'Valuation year on the notice' })
  @IsString()
  @IsNotEmpty()
  valuationYear: string;

  @ApiProperty({ example: '2024-03-01', description: 'Statutory deadline for lodging the dispute' })
  @IsDateString()
  statutoryDeadline: string;

  // ─── Client Director ────────────────────────────────────────────────────────

  @ApiProperty({
    example: 'ddd8a242-12f6-46eb-8e09-80d3b96ea460',
    description: 'Accountant ID to assign to the dispute',
  })
  @IsString()
  accountantId: string;

  // ─── Additional Notes ───────────────────────────────────────────────────────

  @ApiProperty({
    example: 'Additional context about the dispute',
    description: 'Additional notes',
    required: false,
  })
  @IsOptional()
  @IsString()
  addNotes?: string;
}
