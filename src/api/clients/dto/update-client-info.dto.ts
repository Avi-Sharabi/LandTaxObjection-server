import { PartialType } from '@nestjs/swagger';
import { CreateClientDto } from './create-client.dto';

export class UpdateClientInfoDto extends PartialType(CreateClientDto) {}
