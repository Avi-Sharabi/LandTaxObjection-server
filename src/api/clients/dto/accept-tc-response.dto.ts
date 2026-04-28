import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientStatus } from '../entities/client.entity';

export class AcceptTcResponseDto {
    @ApiProperty({ description: 'Whether the T&C was successfully accepted' })
    tcAccepted: boolean;

    @ApiProperty({ enum: ClientStatus, description: 'The updated client status after acceptance' })
    newStatus: ClientStatus;

    @ApiPropertyOptional({ description: 'Contextual note about the operation result' })
    message?: string;
}
