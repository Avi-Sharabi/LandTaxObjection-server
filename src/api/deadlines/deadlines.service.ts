import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { DisputeCase, DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';
import { DeadlineCaseResponseDto } from './dto/deadline-case-response.dto';
import { GetDeadlinesQueryDto, UrgencyCategory } from './dto/get-deadlines-query.dto';

const TERMINAL_STATUSES: DisputeStatus[] = [
  DisputeStatus.OUTCOME_RECEIVED,
  DisputeStatus.CLOSED,
  DisputeStatus.CLOSED_NO_OBJECTION,
];

const DEADLINE_WINDOW_DAYS = 60;
const SAFE_THRESHOLD_DAYS = 14;
const APPROACHING_THRESHOLD_DAYS = 7;
const MS_PER_DAY = 86_400_000;

@Injectable()
export class DeadlinesService {
  constructor(
    @InjectRepository(DisputeCase)
    private readonly disputeCasesRepository: Repository<DisputeCase>,
  ) {}

  async getDeadlineCases(query: GetDeadlinesQueryDto): Promise<DeadlineCaseResponseDto[]> {
    const cases = await this.disputeCasesRepository.find({
      where: { status: Not(In(TERMINAL_STATUSES)) },
      relations: ['client', 'property', 'assigned_accountant'],
      order: { statutory_deadline: 'ASC' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mapped = cases.map((c): DeadlineCaseResponseDto => {
      const deadline = new Date(c.statutory_deadline);
      deadline.setHours(0, 0, 0, 0);

      const days_remaining = Math.ceil((deadline.getTime() - today.getTime()) / MS_PER_DAY);
      const days_elapsed = Math.min(Math.max(DEADLINE_WINDOW_DAYS - days_remaining, 0), DEADLINE_WINDOW_DAYS);
      const urgency_category = DeadlinesService.resolveUrgency(days_remaining);

      return {
        id: c.id,
        case_reference: c.case_reference,
        status: c.status,
        jurisdiction: c.jurisdiction,
        statutory_deadline: c.statutory_deadline,
        days_remaining,
        days_elapsed,
        total_window_days: DEADLINE_WINDOW_DAYS,
        urgency_category,
        client: {
          id: c.client.id,
          name: c.client.name,
        },
        property: {
          id: c.property.id,
          address: c.property.address,
          suburb: c.property.suburb,
          state: c.property.state,
          postcode: c.property.postcode,
        },
        assigned_accountant: c.assigned_accountant?.fullName ?? null,
      };
    });

    if (query.urgency) {
      return mapped.filter((c) => c.urgency_category === query.urgency);
    }

    return mapped;
  }

  private static resolveUrgency(daysRemaining: number): UrgencyCategory {
    if (daysRemaining > SAFE_THRESHOLD_DAYS) return 'safe';
    if (daysRemaining >= APPROACHING_THRESHOLD_DAYS) return 'approaching';
    return 'urgent';
  }
}
