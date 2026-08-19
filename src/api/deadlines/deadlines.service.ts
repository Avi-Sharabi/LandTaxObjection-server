import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOperator,
  In,
  LessThan,
  MoreThan,
  Not,
  Repository,
} from 'typeorm';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { POST_LODGEMENT_STATUSES } from '../dispute-cases/dispute-status';
import {
  addDays,
  auToday,
  daysBetween,
  toDateString,
  toDbDate,
} from '../../common/utils/au-date.util';
import { DeadlineCaseResponseDto } from './dto/deadline-case-response.dto';
import {
  DeadlineCategory,
  GetDeadlinesQueryDto,
} from './dto/get-deadlines-query.dto';
import { PaginatedDeadlinesResponseDto } from './dto/paginated-deadlines-response.dto';

const SAFE_THRESHOLD_DAYS = 14;
const APPROACHING_THRESHOLD_DAYS = 7;

/** safe: d > today+14 | approaching: today+7 <= d <= today+14 | urgent: d < today+7. */
function deadlineRange(
  category: DeadlineCategory,
  today: string,
): FindOperator<Date> {
  const safeFrom = toDbDate(addDays(today, SAFE_THRESHOLD_DAYS));
  const approachingFrom = toDbDate(addDays(today, APPROACHING_THRESHOLD_DAYS));
  switch (category) {
    case 'safe':
      return MoreThan(safeFrom);
    case 'approaching':
      return Between(approachingFrom, safeFrom);
    case 'urgent':
      return LessThan(approachingFrom);
  }
}

@Injectable()
export class DeadlinesService {
  private readonly logger = new Logger(DeadlinesService.name);

  constructor(
    @InjectRepository(DisputeCase)
    private readonly disputeCasesRepository: Repository<DisputeCase>,
  ) {}

  async getDeadlineCases(
    query: GetDeadlinesQueryDto,
  ): Promise<PaginatedDeadlinesResponseDto> {
    const { category, page, limit } = query;
    const today = auToday();

    const [rows, total] = await this.disputeCasesRepository.findAndCount({
      where: {
        status: Not(In(POST_LODGEMENT_STATUSES)),
        statutory_deadline: deadlineRange(category, today),
      },
      relations: { client: true, property: true },
      select: {
        id: true,
        case_reference: true,
        status: true,
        statutory_deadline: true,
        client: { name: true },
        property: { address: true, suburb: true, state: true, postcode: true },
      },
      // id breaks ties: statutory_deadline is a `date` shared by many cases (dozens of seeded
      // rows share one date), and an unstable tie order duplicates/skips rows while scrolling.
      order: { statutory_deadline: 'ASC', id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data = rows
      .map((c) => this.toDeadlineDto(c, today))
      .filter((c): c is DeadlineCaseResponseDto => c !== null);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private toDeadlineDto(
    c: DisputeCase,
    today: string,
  ): DeadlineCaseResponseDto | null {
    // Both relations are `nullable: false`, so this should be unreachable — but a soft-deleted
    // Client is excluded via the JOIN condition, not the main WHERE, so a case whose client was
    // soft-deleted out of band (e.g. by a hand-composed ai-update-database UPDATE) would come
    // back with client === null. Cheap insurance against a 500 on c.client.name below.
    if (!c.client) {
      this.logger.warn(`Case ${c.id} skipped: missing client relation`);
      return null;
    }
    if (!c.property) {
      this.logger.warn(`Case ${c.id} skipped: missing property relation`);
      return null;
    }

    return {
      id: c.id,
      case_reference: c.case_reference,
      status: c.status,
      statutory_deadline: c.statutory_deadline,
      days_remaining: daysBetween(today, toDateString(c.statutory_deadline)),
      client: {
        name: c.client.name,
      },
      property: {
        address: c.property.address,
        suburb: c.property.suburb,
        state: c.property.state,
        postcode: c.property.postcode,
      },
    };
  }
}
