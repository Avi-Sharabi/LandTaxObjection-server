import { PartialType } from '@nestjs/mapped-types';
import { CreateDisputeCaseDto } from './create-dispute-case.dto';

export class UpdateDisputeCaseDto extends PartialType(CreateDisputeCaseDto) {}
