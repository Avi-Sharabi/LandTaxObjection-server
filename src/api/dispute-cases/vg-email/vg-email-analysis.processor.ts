import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { MsGraphService } from 'src/common/ms-graph/ms-graph.service';
import { DisputeCase, DisputeStatus } from '../entities/dispute-case.entity';
import { DisputeCasesService } from '../dispute-cases.service';
import { VgEmailAnalysisService } from './vg-email-analysis.service';
import {
  VG_EMAIL_ANALYSIS_QUEUE,
  VgEmailAnalysisJobData,
  VgEmailAnalysisJobResult,
} from './vg-email-analysis.queue';

@Processor(VG_EMAIL_ANALYSIS_QUEUE)
export class VgEmailAnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(VgEmailAnalysisProcessor.name);

  constructor(
    @InjectRepository(DisputeCase)
    private readonly disputeCasesRepo: Repository<DisputeCase>,
    private readonly analysisService: VgEmailAnalysisService,
    private readonly disputeCasesService: DisputeCasesService,
    private readonly msGraphService: MsGraphService,
  ) {
    super();
  }

  async process(job: Job<VgEmailAnalysisJobData>): Promise<VgEmailAnalysisJobResult> {
    const { messageId } = job.data;
    this.logger.log(
      JSON.stringify({ context: 'VG-PROCESSOR.start', jobId: job.id, messageId, ts: new Date().toISOString() }),
    );

    try {
      const result = await this.runPipeline(job.data);
      this.logger.log(
        JSON.stringify({
          context: 'VG-PROCESSOR.completed',
          jobId: job.id,
          messageId,
          resultCount: result.results.length,
          results: result.results.map((r) => ({ pid: r.pid ?? '-', outcome: r.outcome, disputeCaseId: r.disputeCaseId ?? '-' })),
          ts: new Date().toISOString(),
        }),
      );
      return result;
    } catch (err: unknown) {
      this.logger.error(
        JSON.stringify({
          context: 'VG-PROCESSOR.failed',
          jobId: job.id,
          messageId,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        }),
      );
      throw err;
    }
  }

  private async runPipeline(data: VgEmailAnalysisJobData): Promise<VgEmailAnalysisJobResult> {
    const { messageId, subject, bodyContent } = data;

    // Step 1: Claude reads email, classifies outcome per property, resolves case_id via pre-fetch
    const { results } = await this.analysisService.analyzeEmail(subject, bodyContent);

    this.logger.log(
      `[VG-PROCESSOR] AI returned ${results.length} result(s) — ${results.map((r) => `property=${r.pid ?? r.address ?? 'unknown'} outcome=${r.outcome} caseId=${r.caseId ?? '-'}`).join(' | ')}`,
    );

    // Step 2 & 3: For each result, verify the case in DB and update its status
    const jobResults: VgEmailAnalysisJobResult['results'] = [];

    for (const result of results) {
      const { pid, outcome, caseId, confidence, reasoning } = result;
      const propertyLabel = result.pid ?? result.address ?? 'unknown';

      let disputeCase: DisputeCase | null = null;
      if (caseId) {
        disputeCase = await this.disputeCasesRepo.findOne({ where: { id: caseId } });
        if (!disputeCase) {
          this.logger.warn(`[VG-PROCESSOR] ${propertyLabel} — Claude returned caseId=${caseId} but not found in DB — skipping`);
        }
      } else if (result.address) {
        // Address-only property — Claude extracted the address, server resolves the case
        const found = await this.analysisService.lookupCaseByAddress(result.address);
        if (found) {
          disputeCase = await this.disputeCasesRepo.findOne({ where: { id: found.case_id } });
          this.logger.log(`[VG-PROCESSOR] ${propertyLabel} — resolved via address lookup → caseId=${found.case_id}`);
        }
      }

      if (disputeCase && (outcome === 'approved' || outcome === 'declined')) {
        const newStatus = outcome === 'approved' ? DisputeStatus.VG_APPROVED : DisputeStatus.VG_DECLINED;
        await this.disputeCasesService.updateVgOutcome(disputeCase.id, newStatus, messageId);
        this.logger.log(
          `[VG-PROCESSOR] Case ${disputeCase.id} (${propertyLabel}) → ${newStatus} confidence=${confidence.toFixed(2)} reasoning="${reasoning}"`,
        );
      } else if (outcome === 'needs_review') {
        this.logger.log(`[VG-PROCESSOR] ${propertyLabel} → needs_review — case status unchanged`);
      } else if (!disputeCase) {
        this.logger.warn(`[VG-PROCESSOR] ${propertyLabel} outcome=${outcome} but no case resolved — case status unchanged`);
      }

      jobResults.push({ outcome, disputeCaseId: disputeCase?.id, pid });
    }

    // Step 4: Mark email as read
    await this.safeMarkAsRead(messageId);

    return { results: jobResults };
  }

  private async safeMarkAsRead(messageId: string): Promise<void> {
    try {
      await this.msGraphService.markMessageAsRead(messageId);
    } catch (err) {
      this.logger.warn(
        `[VG-PROCESSOR] Failed to mark messageId=${messageId} as read: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
