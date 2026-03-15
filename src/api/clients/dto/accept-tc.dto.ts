import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CreateClientDto } from './create-client.dto';

export class AcceptTCDto extends PartialType(CreateClientDto) {

    @ApiProperty({ description: 'UUID of the accountant to assign to the dispute case' })
    @IsString()
    assigned_accountant_id: string;

}
