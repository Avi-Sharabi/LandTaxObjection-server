import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DisputeCase, DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';
import { DeadlineRiskCaseDto } from './dto/dashboard-response.dto';

const TERMINAL_STATUSES: DisputeStatus[] = [
  DisputeStatus.CLOSED,
  DisputeStatus.CLOSED_NO_OBJECTION,
  DisputeStatus.VG_APPROVED,
  DisputeStatus.VG_DECLINED,
];

const DEADLINE_RISK_LIMIT = 8;

@Injectable()
export class DashboardRepository {
  constructor(
    @InjectRepository(DisputeCase)
    private readonly repo: Repository<DisputeCase>,
  ) {}

  getActiveCasesCount(): Promise<number> {
    return this.repo
      .createQueryBuilder('dc')
      .where('dc.deleted_at IS NULL')
      .andWhere('dc.status NOT IN (:...statuses)', { statuses: TERMINAL_STATUSES })
      .getCount();
  }

  getDeadlineCounts(): Promise<{ due_this_week_count: number; overdue_count: number }> {
    return this.repo
      .createQueryBuilder('dc')
      .select(
        `COUNT(*) FILTER (WHERE (dc.statutory_deadline::date - CURRENT_DATE) BETWEEN 0 AND 7)::int`,
        'due_this_week_count',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE (dc.statutory_deadline::date - CURRENT_DATE) < 0)::int`,
        'overdue_count',
      )
      .where('dc.deleted_at IS NULL')
      .andWhere('dc.status NOT IN (:...statuses)', { statuses: TERMINAL_STATUSES })
      .andWhere('dc.statutory_deadline IS NOT NULL')
      .getRawOne<{ due_this_week_count: number; overdue_count: number }>()
      .then((row) => row ?? { due_this_week_count: 0, overdue_count: 0 });
  }

  getDeadlineRiskCases(): Promise<DeadlineRiskCaseDto[]> {
    return this.repo
      .createQueryBuilder('dc')
      .select(['dc.id', 'dc.case_reference', 'dc.statutory_deadline'])
      .addSelect('p.address', 'property_address')
      .addSelect('c.name', 'client_name')
      .innerJoin('dc.property', 'p')
      .innerJoin('dc.client', 'c')
      .where('dc.deleted_at IS NULL')
      .andWhere('dc.status NOT IN (:...statuses)', { statuses: TERMINAL_STATUSES })
      .andWhere('dc.statutory_deadline IS NOT NULL')
      .orderBy('dc.statutory_deadline', 'ASC')
      .limit(DEADLINE_RISK_LIMIT)
      .getRawMany();
  }
}
