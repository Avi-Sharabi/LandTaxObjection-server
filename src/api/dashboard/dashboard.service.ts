import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DisputeCase, DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';
import { StatusCountersResponseDto } from './dto/status-counters-response.dto';

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

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(DisputeCase)
    private readonly disputeCasesRepository: Repository<DisputeCase>,
  ) {}

  async getStatusCounters(): Promise<StatusCountersResponseDto> {
    const qb = this.disputeCasesRepository
      .createQueryBuilder('dc')
      .select('dc.status', 'status')
      .addSelect('COUNT(dc.id)', 'count')
      .groupBy('dc.status');

    const rawRows = await qb.getRawMany<{ status: string; count: string }>();

    // pg driver returns COUNT as string — parse to number
    const countByStatus = new Map(
      rawRows.map((r) => [r.status as DisputeStatus, parseInt(r.count, 10)]),
    );

    const counters = Object.values(DisputeStatus).map((status) => ({
      status,
      count: countByStatus.get(status) ?? 0,
      label: STATUS_LABEL_MAP[status],
    }));

    return {
      counters,
      total: counters.reduce((sum, c) => sum + c.count, 0),
    };
  }
}
