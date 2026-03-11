import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { LegalGround } from '../../dispute-legal-grounds/entities/dispute-legal-ground.entity';
import { Jurisdiction } from '../../properties/entities/property.entity';

export class CreateDisputeIntakeDto {
  // File upload - base64 encoded PDF
  @ApiProperty({ example: 'JVBERi0xLjQKJeLjz9M...', description: 'Base64 encoded PDF content', required: false })
  @IsOptional()
  @IsString()
  pdfBase64?: string;

  @ApiProperty({ example: 'land_tax_bill.pdf', description: 'Original PDF filename', required: false })
  @IsOptional()
  @IsString()
  pdfFileName?: string;

  // Your Details
  @ApiProperty({ example: 'Jane Smith', description: 'Full name of the applicant' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'jane@example.com', description: 'Email address of the applicant' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123 Example St, Sydney NSW 2000', description: 'Property address' })
  @IsString()
  propAddress: string;

  @ApiProperty({ example: 2024, description: 'Assessment year from', minimum: 1976, maximum: 2100 })
  @IsInt()
  @Min(1976)
  @Max(2100)
  assessYearFrom: number;

  @ApiProperty({ example: 2026, description: 'Assessment year to', minimum: 1976, maximum: 2100 })
  @IsInt()
  @Min(1976)
  @Max(2100)
  assessYearTo: number;

  // Client Director
  @ApiProperty({ example: 'ddd8a242-12f6-46eb-8e09-80d3b96ea460', description: 'Director ID' })
  @IsString()
  dirId: string;

  // Grounds for Dispute
  @ApiProperty({
    enum: LegalGround,
    isArray: true,
    description: 'Legal grounds for dispute',
    example: ['incorrect_land_value', 'incorrect_area_or_dimensions']
  })
  @IsArray()
  @IsEnum(LegalGround, { each: true })
  grounds: LegalGround[];

  // Additional Notes
  @ApiProperty({ example: 'Additional context about the dispute', description: 'Additional notes', required: false })
  @IsOptional()
  @IsString()
  addNotes?: string;

  // State/Jurisdiction
  @ApiProperty({ enum: Jurisdiction, example: 'NSW', description: 'State/jurisdiction for the property' })
  @IsEnum(Jurisdiction)
  state: Jurisdiction;
}
