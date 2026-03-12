import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { LegalGround } from '../../dispute-legal-grounds/entities/dispute-legal-ground.entity';
import { Jurisdiction } from '../../properties/entities/property.entity';

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

  @ApiProperty({
    example: 'Jane Smith',
    description: 'Full name of the applicant (maps to JSON: FullName)',
  })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({
    example: 'jane@example.com',
    description: 'Email address of the applicant (maps to JSON: email)',
  })
  @IsEmail()
  email: string;

  // ─── Property ───────────────────────────────────────────────────────────────

  @ApiProperty({
    example: '123 Example St, Sydney NSW 2000',
    description: 'Property address (maps to JSON: propertyAddress)',
  })
  @IsString()
  @IsNotEmpty()
  propAddress: string;

  @ApiProperty({
    enum: Jurisdiction,
    example: 'NSW',
    description: 'State/jurisdiction for the property (maps to JSON: state)',
  })
  @IsEnum(Jurisdiction)
  state: Jurisdiction;

  // ─── Valuation / Notice Details ─────────────────────────────────────────────

  @ApiProperty({
    example: '2026-04-03',
    description: 'Date on the valuation notice (maps to JSON: noticeDate)',
  })
  @IsDateString()
  noticeDate: string;

  @ApiProperty({
    example: '2024',
    description: 'Valuation year on the notice (maps to JSON: valuationYear)',
  })
  @IsString()
  @IsNotEmpty()
  valuationYear: string;

  @ApiProperty({
    example: 5555555555555,
    description: 'Assessed land value from the notice (maps to JSON: assessedLandValue)',
  })
  @IsNumber()
  assessedLandValue: number;

  @ApiProperty({
    example: '2024-03-01',
    description: 'Statutory deadline for lodging the dispute (maps to JSON: statutoryDeadline)',
  })
  @IsDateString()
  statutoryDeadline: string;

  // ─── Client Director ────────────────────────────────────────────────────────

  @ApiProperty({
    example: 'ddd8a242-12f6-46eb-8e09-80d3b96ea460',
    description: 'Accountant ID to assign to the dispute (maps to JSON: accountantId)',
  })
  @IsString()
  accountantId: string;

  // ─── Grounds for Dispute ────────────────────────────────────────────────────

  @ApiProperty({
    enum: LegalGround,
    isArray: true,
    description: 'Legal grounds for dispute (maps to JSON: legalGrounds)',
    example: ['incorrect_land_value', 'incorrect_area_or_dimensions'],
  })
  @IsArray()
  @IsEnum(LegalGround, { each: true })
  grounds: LegalGround[];

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