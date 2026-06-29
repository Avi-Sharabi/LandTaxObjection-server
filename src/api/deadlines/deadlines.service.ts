import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, In, LessThan, MoreThan, Not, Repository } from 'typeorm';
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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

@Injectable()
export class DeadlinesService {
  private readonly logger = new Logger(DeadlinesService.name);

  constructor(
    @InjectRepository(DisputeCase)
    private readonly disputeCasesRepository: Repository<DisputeCase>,
  ) {}

  async getDeadlineCases(query: GetDeadlinesQueryDto): Promise<CategorizedDeadlineResponseDto> {
    const page  = query.page  ?? 1;
    const limit = query.limit ?? 4;
    const skip  = (page - 1) * limit;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const safeThreshold       = addDays(today, SAFE_THRESHOLD_DAYS);
    const approachingThreshold = addDays(today, APPROACHING_THRESHOLD_DAYS);

    const baseWhere: FindOptionsWhere<DisputeCase> = {
      status: Not(In(TERMINAL_STATUSES)),
    };

    const [
      safeCases,
      approachingCases,
      urgentCases,
      safeTotal,
      approachingTotal,
      urgentTotal,
    ] = await Promise.all([
      this.fetchPage({ ...baseWhere, statutory_deadline: MoreThan(safeThreshold) }, skip, limit, 'ASC'),
      this.fetchPage({ ...baseWhere, statutory_deadline: Between(approachingThreshold, safeThreshold) }, skip, limit, 'ASC'),
      // ASC on urgent: lowest date (most overdue) surfaces first
      this.fetchPage({ ...baseWhere, statutory_deadline: LessThan(approachingThreshold) }, skip, limit, 'ASC'),
      this.countCategory({ ...baseWhere, statutory_deadline: MoreThan(safeThreshold) }),
      this.countCategory({ ...baseWhere, statutory_deadline: Between(approachingThreshold, safeThreshold) }),
      this.countCategory({ ...baseWhere, statutory_deadline: LessThan(approachingThreshold) }),
    ]);

    return {
      safe:        this.mapCases(safeCases, today),
      approaching: this.mapCases(approachingCases, today),
      urgent:      this.mapCases(urgentCases, today),
      safeTotal,
      approachingTotal,
      urgentTotal,
      total: safeTotal + approachingTotal + urgentTotal,
      hasMore: {
        safe:        skip + limit < safeTotal,
        approaching: skip + limit < approachingTotal,
        urgent:      skip + limit < urgentTotal,
      },
    };
  }

  private async fetchPage(
    where: FindOptionsWhere<DisputeCase>,
    skip: number,
    limit: number,
    order: 'ASC' | 'DESC',
  ): Promise<DisputeCase[]> {
    return this.disputeCasesRepository.find({
      where,
      relations: ['client', 'property', 'assigned_accountant'],
      order: { statutory_deadline: order },
      take: limit,
      skip,
    });
  }

  private async countCategory(where: FindOptionsWhere<DisputeCase>): Promise<number> {
    return this.disputeCasesRepository.count({ where });
  }

  private mapCases(cases: DisputeCase[], today: Date): DeadlineCaseResponseDto[] {
    return cases
      .map((c): DeadlineCaseResponseDto | null => {
        if (!c.client) {
          this.logger.warn(`Case ${c.id} skipped: missing client relation`);
          return null;
        }
        if (!c.property) {
          this.logger.warn(`Case ${c.id} skipped: missing property relation`);
          return null;
        }

        const deadline = new Date(c.statutory_deadline);
        deadline.setUTCHours(0, 0, 0, 0);

        const days_remaining = Math.ceil((deadline.getTime() - today.getTime()) / MS_PER_DAY);
        const days_elapsed   = Math.min(Math.max(DEADLINE_WINDOW_DAYS - days_remaining, 0), DEADLINE_WINDOW_DAYS);
        const urgency_category = DeadlinesService.resolveUrgency(days_remaining);

        return {
          id:                 c.id,
          case_reference:     c.case_reference,
          status:             c.status,
          jurisdiction:       c.jurisdiction,
          statutory_deadline: c.statutory_deadline,
          days_remaining,
          days_elapsed,
          total_window_days:  DEADLINE_WINDOW_DAYS,
          urgency_category,
          client: {
            id:   c.client.id,
            name: c.client.name,
          },
          property: {
            id:       c.property.id,
            address:  c.property.address,
            suburb:   c.property.suburb,
            state:    c.property.state,
            postcode: c.property.postcode,
          },
          assigned_accountant: c.assigned_accountant?.fullName ?? null,
        };
      })
      .filter((c): c is DeadlineCaseResponseDto => c !== null);
  }

  private static resolveUrgency(daysRemaining: number): UrgencyCategory {
    if (daysRemaining > SAFE_THRESHOLD_DAYS) return 'safe';
    if (daysRemaining >= APPROACHING_THRESHOLD_DAYS) return 'approaching';
    return 'urgent';
  }
}
