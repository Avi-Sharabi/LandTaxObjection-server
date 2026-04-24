import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientStatus } from '../entities/client.entity';
import { DisputeStatus } from '../../dispute-cases/entities/dispute-case.entity';

export class AcceptTcResponseDto {
    @ApiProperty({ description: 'Whether the T&C was successfully accepted' })
    tcAccepted: boolean;

    @ApiProperty({ enum: ClientStatus, description: 'The updated client status after acceptance' })
    newStatus: ClientStatus;

    @ApiPropertyOptional({ enum: DisputeStatus, description: 'Updated case status after T&C acceptance' })
    newCaseStatus?: DisputeStatus;

    @ApiPropertyOptional({ description: 'Whether the client was successfully registered in XPM' })
    xpmRegistered?: boolean;

    @ApiPropertyOptional({ description: 'Contextual note about the operation result' })
    message?: string;
}