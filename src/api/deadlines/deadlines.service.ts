import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { DisputeCase, DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';
import { DeadlineCaseResponseDto } from './dto/deadline-case-response.dto';
import { CategorizedDeadlineResponseDto } from './dto/categorized-deadline-response.dto';
import { GetDeadlinesQueryDto, UrgencyCategory } from './dto/get-deadlines-query.dto';

const TERMINAL_STATUSES: DisputeStatus[] = [
  DisputeStatus.SUBMITTED_TO_VG,
  DisputeStatus.VG_APPROVED,
  DisputeStatus.VG_DECLINED,
  DisputeStatus.FOR_REVIEW,
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

  async getDeadlineCases(query: GetDeadlinesQueryDto): Promise<CategorizedDeadlineResponseDto> {
    const mapped = await this.fetchMappedCases();

    const allSafe = mapped.filter((c) => c.urgency_category === 'safe');
    const allApproaching = mapped.filter((c) => c.urgency_category === 'approaching');
    const allUrgent = mapped.filter((c) => c.urgency_category === 'urgent');

    const safeTotal = allSafe.length;
    const approachingTotal = allApproaching.length;
    const urgentTotal = allUrgent.length;
    const total = mapped.length;

    const page = query.page ?? 1;
    const limit = query.limit ?? 4;
    const skip = (page - 1) * limit;

    const safe = allSafe.slice(skip, skip + limit);
    const approaching = allApproaching.slice(skip, skip + limit);
    const urgent = allUrgent.slice(skip, skip + limit);

    const hasMore =
      skip + limit < safeTotal ||
      skip + limit < approachingTotal ||
      skip + limit < urgentTotal;

    return { safe, approaching, urgent, safeTotal, approachingTotal, urgentTotal, total, hasMore };
  }

  private async fetchMappedCases(): Promise<DeadlineCaseResponseDto[]> {
    const cases = await this.disputeCasesRepository.find({
      where: { status: Not(In(TERMINAL_STATUSES)) },
      relations: ['client', 'property', 'assigned_accountant'],
      order: { created_at: 'DESC' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return cases.map((c): DeadlineCaseResponseDto => {
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
  }

  private static resolveUrgency(daysRemaining: number): UrgencyCategory {
    if (daysRemaining > SAFE_THRESHOLD_DAYS) return 'safe';
    if (daysRemaining >= APPROACHING_THRESHOLD_DAYS) return 'approaching';
    return 'urgent';
  }
}
