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

  async updateInternalAssessedValue(id: string, value: number | null): Promise<void> {
    await this.disputeCaseRepo.update(id, { internal_assessed_value: value });
  }

  // update(), not save(entity): the analyze-ai pipeline writes other columns on this row around the
  // same time (markValuated, updateInternalAssessedValue), and a fetched-then-saved entity would
  // clobber them.
  async updateEvidenceScore(id: string, score: number | null, rationale: string | null): Promise<void> {
    await this.disputeCaseRepo.update(id, {
      evidence_strength_score: score,
      evidence_strength_rationale: rationale,
    });
  }

  getComparables(disputeCaseId: string): Promise<ComparableSale[]> {
    return this.comparableSaleRepo.find({
      where: { dispute_case_id: disputeCaseId },
      order: { contract_date: 'DESC' },
      take: 10,
    });
  }

  // getComparables() samples only 10 rows, which is plenty for judging quality but would understate
  // the total in a user-visible rationale ("3 of 10" on a case with 23 sales).
  countComparables(disputeCaseId: string): Promise<number> {
    return this.comparableSaleRepo.count({ where: { dispute_case_id: disputeCaseId } });
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
