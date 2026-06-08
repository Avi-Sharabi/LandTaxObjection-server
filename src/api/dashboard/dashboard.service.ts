import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { RedisCacheService } from '../../common/redis-cache/redis-cache.service';
import { DisputeCase, DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';
import { StatusCountersResponseDto } from './dto/status-counters-response.dto';
import { GetDeadlineRiskQueryDto, DeadlineRiskLevel } from './dto/deadline-risk-query.dto';
import { DeadlineRiskItemDto, DeadlineRiskResponseDto } from './dto/deadline-risk-response.dto';

export const STATUS_LABEL_MAP: Record<DisputeStatus, string> = {
  [DisputeStatus.PENDING_TNC]: 'Pending T&C',
  [DisputeStatus.DRAFT]: 'Draft',
  [DisputeStatus.GROUNDS_SELECTION]: 'Grounds Selection',
  [DisputeStatus.EVIDENCE_COMPILATION]: 'Evidence Compilation',
  [DisputeStatus.APPRAISAL]: 'Appraisal',
  [DisputeStatus.ADVISORY_LETTER_ISSUED]: 'Advisory Letter Issued',
  [DisputeStatus.OBJECTION_PACKAGE_PREPARED]: 'Objection Package Prepared',
  [DisputeStatus.AWAITING_CLIENT_APPROVAL]: 'Awaiting Client Approval',
  [DisputeStatus.CLIENT_APPROVED]: 'Client Approved',
  [DisputeStatus.SUBMITTED_TO_VG]: 'Submitted to VG',
  [DisputeStatus.VG_RESPONSE_RECEIVED]: 'VG Response Received',
  [DisputeStatus.VG_APPROVED]: 'VG Approved',
  [DisputeStatus.VG_DECLINED]: 'VG Declined',
  [DisputeStatus.FOR_REVIEW]: 'For Review',
  [DisputeStatus.OUTCOME_RECEIVED]: 'Outcome Received',
  [DisputeStatus.CLOSED]: 'Closed',
  [DisputeStatus.CLOSED_NO_OBJECTION]: 'Closed – No Objection',
};

const DEADLINE_RISK_EXCLUDED_STATUSES = [DisputeStatus.CLOSED, DisputeStatus.CLOSED_NO_OBJECTION];

const ACTIVE_STATUSES = new Set<DisputeStatus>([
  DisputeStatus.DRAFT,
  DisputeStatus.GROUNDS_SELECTION,
  DisputeStatus.EVIDENCE_COMPILATION,
  DisputeStatus.APPRAISAL,
  DisputeStatus.ADVISORY_LETTER_ISSUED,
  DisputeStatus.OBJECTION_PACKAGE_PREPARED,
  DisputeStatus.CLIENT_APPROVED,
  DisputeStatus.SUBMITTED_TO_VG,
  DisputeStatus.VG_RESPONSE_RECEIVED,
  DisputeStatus.VG_APPROVED,
  DisputeStatus.VG_DECLINED,
  DisputeStatus.FOR_REVIEW,
]);

const DUE_THIS_WEEK_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(DisputeCase)
    private readonly disputeCasesRepository: Repository<DisputeCase>,
    private readonly configService: ConfigService,
    private readonly cache: RedisCacheService,
  ) {}

  async getStatusCounters(): Promise<StatusCountersResponseDto> {
    const cacheKey = 'dashboard:status-counters';
    const cached = await this.cache.get<StatusCountersResponseDto>(cacheKey);
    if (cached) return cached;

    const countersRaw = await this.disputeCasesRepository
      .createQueryBuilder('dc')
      .select('dc.status', 'status')
      .addSelect('COUNT(dc.id)', 'count')
      .groupBy('dc.status')
      .getRawMany<{ status: string; count: string }>();

    // pg driver returns COUNT as string — parse to number
    const countByStatus = new Map(
      countersRaw.map((r) => [r.status as DisputeStatus, parseInt(r.count, 10)]),
    );

    const counters = Object.values(DisputeStatus).map((status) => ({
      status,
      count: countByStatus.get(status) ?? 0,
      label: STATUS_LABEL_MAP[status],
    }));

    const total = counters.reduce((sum, c) => sum + c.count, 0);
    const active_cases_count = counters
      .filter((c) => ACTIVE_STATUSES.has(c.status))
      .reduce((sum, c) => sum + c.count, 0);

    const result: StatusCountersResponseDto = { counters, total, active_cases_count };
    await this.cache.set(cacheKey, result, 60_000);
    return result;
  }

  async getDeadlineRisk(query: GetDeadlineRiskQueryDto): Promise<DeadlineRiskResponseDto> {
    const { riskLevel } = query;
    const cacheKey = riskLevel ? `dashboard:deadline-risk:${riskLevel}` : 'dashboard:deadline-risk';
    const cached = await this.cache.get<DeadlineRiskResponseDto>(cacheKey);
    if (cached) return cached;

    const atRiskDays = parseInt(this.configService.get('DEADLINE_RISK_AT_RISK_DAYS') || '14', 10);
    const dueSoonDays = parseInt(this.configService.get('DEADLINE_RISK_DUE_SOON_DAYS') || '30', 10);

    // Compute boundaries at midnight UTC to align with PostgreSQL `date` column storage
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const atRiskCutoff = new Date(today);
    atRiskCutoff.setUTCDate(atRiskCutoff.getUTCDate() + atRiskDays);

    const dueSoonCutoff = new Date(today);
    dueSoonCutoff.setUTCDate(dueSoonCutoff.getUTCDate() + dueSoonDays);

    const qb = this.disputeCasesRepository
      .createQueryBuilder('dc')
      .leftJoin('dc.client', 'client')
      .leftJoin('dc.property', 'property')
      .leftJoin('dc.assigned_accountant', 'accountant')
      .addSelect(['client.name', 'property.address', 'property.suburb', 'property.postcode', 'accountant.fullName'])
      .where('dc.status NOT IN (:...excludedStatuses)', {
        excludedStatuses: DEADLINE_RISK_EXCLUDED_STATUSES,
      });

    // Narrow to a specific risk tier when requested
    if (riskLevel === DeadlineRiskLevel.OVERDUE) {
      qb.andWhere('dc.statutory_deadline < :today', { today });
    } else if (riskLevel === DeadlineRiskLevel.AT_RISK) {
      qb.andWhere('dc.statutory_deadline >= :today', { today }).andWhere(
        'dc.statutory_deadline < :atRiskCutoff',
        { atRiskCutoff },
      );
    } else if (riskLevel === DeadlineRiskLevel.DUE_SOON) {
      qb.andWhere('dc.statutory_deadline >= :atRiskCutoff', { atRiskCutoff }).andWhere(
        'dc.statutory_deadline < :dueSoonCutoff',
        { dueSoonCutoff },
      );
    } else if (riskLevel === DeadlineRiskLevel.SAFE) {
      qb.andWhere('dc.statutory_deadline >= :dueSoonCutoff', { dueSoonCutoff });
    }

    qb.orderBy('dc.statutory_deadline', 'ASC').take(500);

    const cases = await qb.getMany();

    const items: DeadlineRiskItemDto[] = cases.map((dc) => {
      const deadlineDate =
        dc.statutory_deadline instanceof Date
          ? dc.statutory_deadline
          : new Date(dc.statutory_deadline as unknown as string);

      const deadlineMs = Date.UTC(
        deadlineDate.getUTCFullYear(),
        deadlineDate.getUTCMonth(),
        deadlineDate.getUTCDate(),
      );

      const daysUntilDeadline = Math.round((deadlineMs - today.getTime()) / MS_PER_DAY);

      let risk_level: DeadlineRiskLevel;
      if (daysUntilDeadline < 0) {
        risk_level = DeadlineRiskLevel.OVERDUE;
      } else if (daysUntilDeadline < atRiskDays) {
        risk_level = DeadlineRiskLevel.AT_RISK;
      } else if (daysUntilDeadline < dueSoonDays) {
        risk_level = DeadlineRiskLevel.DUE_SOON;
      } else {
        risk_level = DeadlineRiskLevel.SAFE;
      }

      return {
        id: dc.id,
        case_reference: dc.case_reference,
        risk_level,
        days_until_deadline: daysUntilDeadline,
        statutory_deadline: dc.statutory_deadline,
        jurisdiction: dc.jurisdiction,
        status: dc.status,
        status_label: STATUS_LABEL_MAP[dc.status],
        client_id: dc.client_id,
        client_name: dc.client?.name ?? null,
        assigned_accountant_name: dc.assigned_accountant?.fullName ?? null,
        property_id: dc.property_id,
        property_address: dc.property?.address ?? null,
        property_suburb: dc.property?.suburb ?? null,
        property_postcode: dc.property?.postcode ?? null,
      };
    });

    const due_this_week_count = items.filter(
      (i) => i.days_until_deadline >= 0 && i.days_until_deadline <= DUE_THIS_WEEK_DAYS,
    ).length;

    const overdue_count = items.filter((i) => i.days_until_deadline < 0).length;

    const result: DeadlineRiskResponseDto = {
      items,
      total: items.length,
      due_this_week_count,
      overdue_count,
      thresholds: {
        at_risk_days: atRiskDays,
        due_soon_days: dueSoonDays,
      },
    };
    await this.cache.set(cacheKey, result, 60_000);
    return result;
  }

}
