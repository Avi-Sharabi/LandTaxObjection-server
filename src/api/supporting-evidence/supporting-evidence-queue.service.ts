import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { SUPPORTING_EVIDENCE_QUEUE, SupportingEvidenceJobData } from './supporting-evidence.processor';
import { SupportingEvidenceResult } from './supporting-evidence.types';
import { DisputeEvidenceIssue } from './entities/dispute-evidence-issue.entity';
import { EvidenceIssueResponseDto } from './dto/evidence-issue-response.dto';

export type EvidenceJobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'unknown';

const STATE_MAP: Record<string, EvidenceJobStatus> = {
  waiting: 'waiting',
  active: 'active',
  completed: 'completed',
  failed: 'failed',
};

@Injectable()
export class SupportingEvidenceQueueService {
  constructor(
    @InjectQueue(SUPPORTING_EVIDENCE_QUEUE)
    private readonly queue: Queue<SupportingEvidenceJobData, SupportingEvidenceResult>,
    @InjectRepository(DisputeEvidenceIssue)
    private readonly evidenceIssuesRepository: Repository<DisputeEvidenceIssue>,
  ) {}

  async enqueue(
    disputeCaseId: string,
    propertyAddress: string,
  ): Promise<{ jobId: string; status: string }> {
    const existing = await this.queue.getJob(disputeCaseId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active' || state === 'waiting') {
        throw new ConflictException(`A supporting-evidence job for this case is already ${state}`);
      }
      await existing.remove();
    }

    const job = await this.queue.add(
      'analyze',
      { disputeCaseId, propertyAddress },
      { jobId: disputeCaseId },
    );
    return { jobId: job.id as string, status: 'queued' };
  }

  async getIssuesByDisputeCase(disputeCaseId: string): Promise<EvidenceIssueResponseDto[]> {
    const rows = await this.evidenceIssuesRepository
      .createQueryBuilder('i')
      .where('i.dispute_case_id = :id', { id: disputeCaseId })
      .orderBy('i.run_id', 'DESC')
      .addOrderBy('i.created_at', 'DESC')
      .getMany();

    if (!rows.length) return [];

    const latestRunId = rows[0].run_id;
    return rows
      .filter(r => r.run_id === latestRunId)
      .map(r => EvidenceIssueResponseDto.fromEntity(r));
  }

  async getJobStatus(jobId: string): Promise<{
    jobId: string;
    status: EvidenceJobStatus;
    issues?: EvidenceIssueResponseDto[];
    error?: string;
    createdAt: number;
    processedAt?: number;
    finishedAt?: number;
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    const state = await job.getState();
    const status = STATE_MAP[state] ?? 'unknown';

    let issues: EvidenceIssueResponseDto[] | undefined;
    if (status === 'completed') {
      const rows = await this.evidenceIssuesRepository
        .createQueryBuilder('i')
        .where('i.dispute_case_id = :id', { id: jobId })
        .orderBy('i.run_id', 'DESC')
        .addOrderBy('i.created_at', 'DESC')
        .getMany();

      if (rows.length) {
        const latestRunId = rows[0].run_id;
        issues = rows
          .filter(r => r.run_id === latestRunId)
          .map(r => EvidenceIssueResponseDto.fromEntity(r));
      }
    }

    return {
      jobId,
      status,
      issues,
      error: job.failedReason ?? undefined,
      createdAt: job.timestamp,
      processedAt: job.processedOn ?? undefined,
      finishedAt: job.finishedOn ?? undefined,
    };
  }
}
