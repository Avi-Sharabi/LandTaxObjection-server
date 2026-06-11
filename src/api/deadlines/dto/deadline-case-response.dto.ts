import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeStatus, Jurisdiction } from '../../dispute-cases/entities/dispute-case.entity';
import type { UrgencyCategory } from './get-deadlines-query.dto';

class DeadlineClientDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

class DeadlinePropertyDto {
  @ApiProperty() id: string;
  @ApiProperty() address: string;
  @ApiProperty() suburb: string;
  @ApiProperty() state: string;
  @ApiProperty() postcode: string;
}

export class DeadlineCaseResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() case_reference: string;
  @ApiProperty({ enum: DisputeStatus }) status: DisputeStatus;
  @ApiProperty({ enum: Jurisdiction }) jurisdiction: Jurisdiction;
  @ApiProperty() statutory_deadline: Date;

  @ApiProperty({ description: 'Days until statutory deadline; negative means overdue' })
  days_remaining: number;

  @ApiProperty({ description: 'Days elapsed out of the 60-day window, capped at [0, 60]' })
  days_elapsed: number;

  @ApiProperty({ default: 60 }) total_window_days: number;

  @ApiProperty({ enum: ['safe', 'approaching', 'urgent'] })
  urgency_category: UrgencyCategory;

  @ApiProperty({ type: DeadlineClientDto }) client: DeadlineClientDto;
  @ApiProperty({ type: DeadlinePropertyDto }) property: DeadlinePropertyDto;

  @ApiPropertyOptional({ description: 'Full name of assigned accountant, null if unassigned' })
  assigned_accountant: string | null;
}
