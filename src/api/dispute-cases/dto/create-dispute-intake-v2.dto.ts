import { OmitType, ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateDisputeIntakeDto, IntakePropertyDto } from './create-dispute-intake.dto';


export class IntakePropertyV2Dto extends OmitType(IntakePropertyDto, [
  'grounds',
  'constraints',
] as const) {}

export class CreateDisputeIntakeV2Dto extends OmitType(CreateDisputeIntakeDto, [
  'accountantId',
  'properties',
] as const) {
  @ApiProperty({
    type: () => IntakePropertyV2Dto,
    isArray: true,
    description: 'List of properties included in this intake submission',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntakePropertyV2Dto)
  properties: IntakePropertyV2Dto[];

  @ApiProperty({
    example: null,
    description: 'Accountant ID to assign to the dispute — optional in v2',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  accountantId?: string | null;
}
