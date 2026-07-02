import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, LessThan, MoreThanOrEqual, Not, In, Repository } from 'typeorm';
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

  async getDeadlineRiskCases(): Promise<DeadlineRiskCaseDto[]> {
    const cases = await this.repo.find({
      where: { ...ACTIVE_CASE_WHERE, statutory_deadline: MoreThanOrEqual(new Date()) },
      relations: { property: true, client: true },
      order: { statutory_deadline: 'ASC' },
      take: DEADLINE_RISK_LIMIT,
    });

    return cases.map((dc) => ({
      id: dc.id,
      case_reference: dc.case_reference,
      statutory_deadline: dc.statutory_deadline ? new Date(dc.statutory_deadline).toISOString() : null,
      property_address: dc.property.address,
      client_name: dc.client.name,
    }));
  }
}
