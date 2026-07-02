import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, LessThan, Not, In, Repository, SelectQueryBuilder } from 'typeorm';
import { DisputeCase, DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';
import { DeadlineRiskCaseDto } from './dto/dashboard-response.dto';

const TERMINAL_STATUSES: DisputeStatus[] = [
  DisputeStatus.CLOSED,
  DisputeStatus.CLOSED_NO_OBJECTION,
  DisputeStatus.VG_APPROVED,
  DisputeStatus.VG_DECLINED,
];

const DEADLINE_RISK_LIMIT = 8;

const ACTIVE_CASE_WHERE = {
  deleted_at: IsNull(),
  status: Not(In(TERMINAL_STATUSES)),
};

@Injectable()
export class DashboardRepository {
  constructor(
    @InjectRepository(DisputeCase)
    private readonly repo: Repository<DisputeCase>,
  ) {}

  private applyActiveCaseConditions(qb: SelectQueryBuilder<DisputeCase>, alias = 'dc') {
    return qb
      .andWhere(`${alias}.deleted_at IS NULL`)
      .andWhere(`${alias}.status NOT IN (:...statuses)`, { statuses: TERMINAL_STATUSES });
  }

  getActiveCasesCount(): Promise<number> {
    return this.repo.count({ where: ACTIVE_CASE_WHERE });
  }

  async getDeadlineCounts(): Promise<{ due_this_week_count: number; overdue_count: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weekEnd.setHours(23, 59, 59, 999);

    const [due_this_week_count, overdue_count] = await Promise.all([
      this.repo.count({ where: { ...ACTIVE_CASE_WHERE, statutory_deadline: Between(today, weekEnd) } }),
      this.repo.count({ where: { ...ACTIVE_CASE_WHERE, statutory_deadline: LessThan(today) } }),
    ]);

    return { due_this_week_count, overdue_count };
  }

  getDeadlineRiskCases(): Promise<DeadlineRiskCaseDto[]> {
    const qb = this.repo
      .createQueryBuilder('dc')
      .select('dc.id', 'id')
      .addSelect('dc.case_reference', 'case_reference')
      .addSelect('dc.statutory_deadline', 'statutory_deadline')
      .addSelect('p.address', 'property_address')
      .addSelect('c.name', 'client_name')
      .innerJoin('dc.property', 'p')
      .innerJoin('dc.client', 'c')
      .andWhere('dc.statutory_deadline IS NOT NULL')
      .andWhere('dc.statutory_deadline >= :today', { today: new Date() })
      .orderBy('dc.statutory_deadline', 'ASC')
      .limit(DEADLINE_RISK_LIMIT);

    return this.applyActiveCaseConditions(qb).getRawMany<DeadlineRiskCaseDto>();
  }
}
