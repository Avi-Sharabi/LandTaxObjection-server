import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, LessThan, MoreThanOrEqual, Not, In, Repository } from 'typeorm';
import { DisputeCase, DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';
import { AuditAction, AuditLog } from '../audit-log/entities/audit-log.entity';
import {
  buildActivityDescription,
  getActivityCategory,
  getActivityColorHint,
} from '../audit-log/audit-log-description.util';
import { DeadlineRiskCaseDto, RecentActivityDto } from './dto/dashboard-response.dto';

const TERMINAL_STATUSES: DisputeStatus[] = [
  DisputeStatus.CLOSED,
  DisputeStatus.CLOSED_NO_OBJECTION,
  DisputeStatus.VG_APPROVED,
  DisputeStatus.VG_DECLINED,
];

const DEADLINE_RISK_LIMIT = 8;
const RECENT_ACTIVITIES_LIMIT = 10;

const ACTIVE_CASE_WHERE = {
  deleted_at: IsNull(),
  status: Not(In(TERMINAL_STATUSES)),
};

interface RecentActivityRow {
  id: string;
  action: AuditAction;
  performed_by: string;
  case_id: string;
  lodgment_reference_number: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  case_reference: string | null;
  performed_by_name: string | null;
}

@Injectable()
export class DashboardRepository {
  constructor(
    @InjectRepository(DisputeCase)
    private readonly repo: Repository<DisputeCase>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
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

  async getRecentActivities(): Promise<RecentActivityDto[]> {
    const rows = await this.auditLogRepo
      .createQueryBuilder('al')
      .leftJoin('dispute_cases', 'dc', 'dc.id = al.case_id')
      .leftJoin('users', 'u', 'u.id = al.performed_by')
      .select([
        'al.id AS id',
        'al.action AS action',
        'al.performed_by AS performed_by',
        'al.case_id AS case_id',
        'al.lodgment_reference_number AS lodgment_reference_number',
        'al.metadata AS metadata',
        'al.created_at AS created_at',
        'dc.case_reference AS case_reference',
        'u.full_name AS performed_by_name',
      ])
      .orderBy('al.created_at', 'DESC')
      .limit(RECENT_ACTIVITIES_LIMIT)
      .getRawMany<RecentActivityRow>();

    return rows.map((row) => {
      const caseReference = row.case_reference ?? 'Unknown case';
      const description = buildActivityDescription(row.action, {
        performedByName: row.performed_by_name,
        caseReference,
        lodgmentReferenceNumber: row.lodgment_reference_number,
        metadata: row.metadata,
      });

      return {
        id: row.id,
        action: row.action,
        description,
        category: getActivityCategory(row.action),
        color_hint: getActivityColorHint(row.action),
        case_id: row.case_id,
        case_reference: row.case_reference,
        performed_by_name: row.performed_by_name,
        created_at: new Date(row.created_at).toISOString(),
      };
    });
  }
}
