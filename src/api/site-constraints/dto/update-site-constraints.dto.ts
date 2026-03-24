import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { CreateSiteConstraintDto } from './site-constraints.dto';

export class UpdateSiteConstraintDto extends PartialType(
OmitType(CreateSiteConstraintDto, ['dispute_id', 'constraint_type','description', 
  'legal_argument'] as const),
) {}

  
