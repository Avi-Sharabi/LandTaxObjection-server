import { ApiProperty } from '@nestjs/swagger';
import { DisputeStatus } from '../../dispute-cases/entities/dispute-case.entity';

class DeadlineClientDto {
  @ApiProperty() name: string;
}

class DeadlinePropertyDto {
  @ApiProperty() address: string;
  @ApiProperty() suburb: string;
  @ApiProperty() state: string;
  @ApiProperty() postcode: string;
}

export class DeadlineCaseResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() case_reference: string;
  @ApiProperty({ enum: DisputeStatus }) status: DisputeStatus;
  @ApiProperty() statutory_deadline: Date;

  @ApiProperty({ description: 'Days until statutory deadline; negative means overdue' })
  days_remaining: number;

  @ApiProperty({ type: DeadlineClientDto }) client: DeadlineClientDto;
  @ApiProperty({ type: DeadlinePropertyDto }) property: DeadlinePropertyDto;
}
