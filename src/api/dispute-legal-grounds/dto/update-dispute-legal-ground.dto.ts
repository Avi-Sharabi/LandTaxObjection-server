import { PartialType } from '@nestjs/mapped-types';
import { CreateDisputeLegalGroundDto } from './create-dispute-legal-ground.dto';

export class UpdateDisputeLegalGroundDto extends PartialType(CreateDisputeLegalGroundDto) {}
