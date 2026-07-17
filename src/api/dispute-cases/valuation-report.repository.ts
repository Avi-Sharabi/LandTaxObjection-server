import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeObjectionReason } from './entities/dispute-objection-reason.entity';
import { ComparableSale } from '../comparables/entities/comparable-sale.entity';
import { DisputeEvidenceIssue } from '../supporting-evidence/entities/dispute-evidence-issue.entity';

@Injectable()
export class ValuationReportRepository {
  private readonly logger = new Logger(ValuationReportRepository.name);

  constructor(
    @InjectRepository(DisputeCase)
    private readonly disputeCaseRepo: Repository<DisputeCase>,
    @InjectRepository(DisputeObjectionReason)
    private readonly objectionReasonRepo: Repository<DisputeObjectionReason>,
    @InjectRepository(ComparableSale)
    private readonly comparableSaleRepo: Repository<ComparableSale>,
    @InjectRepository(DisputeEvidenceIssue)
    private readonly evidenceIssueRepo: Repository<DisputeEvidenceIssue>,
  ) {}

  findDisputeCaseWithRelations(id: string): Promise<DisputeCase | null> {
    return this.disputeCaseRepo.findOne({
      where: { id },
      relations: ['property', 'valuation_notice'],
    });
  }

  async updateAnalysisReportPath(id: string, blobPath: string): Promise<void> {
    await this.disputeCaseRepo.update(id, { analysis_report_blob_path: blobPath });
  }

  async updateAiAssessedValue(id: string, value: number | null): Promise<void> {
    await this.disputeCaseRepo.update(id, { ai_assessed_value: value });
  }

  getComparables(disputeCaseId: string): Promise<ComparableSale[]> {
    return this.comparableSaleRepo.find({
      where: { dispute_case_id: disputeCaseId },
      order: { contract_date: 'DESC' },
      take: 10,
    });
  }

  async getLatestEvidenceIssues(disputeCaseId: string): Promise<DisputeEvidenceIssue[]> {
    const latest = await this.evidenceIssueRepo
      .createQueryBuilder('e')
      .select('MAX(e.run_id)', 'maxRunId')
      .where('e.dispute_case_id = :id', { id: disputeCaseId })
      .getRawOne<{ maxRunId: string }>();

    if (!latest?.maxRunId) return [];

    return this.evidenceIssueRepo.find({
      where: { dispute_case_id: disputeCaseId, run_id: parseInt(latest.maxRunId, 10) },
    });
  }

  async getLatestObjectionReasons(disputeCaseId: string): Promise<DisputeObjectionReason[]> {
    const latest = await this.objectionReasonRepo
      .createQueryBuilder('r')
      .select('MAX(r.run_id)', 'maxRunId')
      .where('r.dispute_case_id = :id', { id: disputeCaseId })
      .getRawOne<{ maxRunId: string }>();

    if (!latest?.maxRunId) return [];

    return this.objectionReasonRepo.find({
      where: { dispute_case_id: disputeCaseId, run_id: parseInt(latest.maxRunId, 10) },
      order: { ground_number: 'ASC' },
    });
  }
}
