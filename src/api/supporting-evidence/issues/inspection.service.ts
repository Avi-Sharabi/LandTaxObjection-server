import { Injectable, Logger } from '@nestjs/common';
import { ClaudeVisionService } from '../shared/claude-vision.service';
import { SupportingEvidenceContext, SupportingEvidenceResult, IssueResult } from '../supporting-evidence.types';
import { toIssueResult } from '../shared/issue-result.mapper';

const STUB: IssueResult = {
  tick: false,
  confidence: 'MANUAL_REVIEW_REQUIRED',
  verification_status: 'AI_DETECTED_UNVERIFIED',
  trigger: null,
  text_box_content: null,
  documents_to_attach: [],
};

@Injectable()
export class InspectionService {
  private readonly logger = new Logger(InspectionService.name);

  constructor(private readonly claudeVision: ClaudeVisionService) {}

  async run(
    ctx: SupportingEvidenceContext,
    issueResults: SupportingEvidenceResult['issues'],
  ): Promise<{
    inspection_access: IssueResult;
    inspection_easement: IssueResult;
    inspection_environmental: IssueResult;
    inspection_views: IssueResult;
  }> {
    this.logger.log(`[INSPECTION] Starting — ${ctx.confirmedAddress}`);

    const anyTicked = [
      issueResults.access_constraints?.tick,
      issueResults.easements?.tick,
      issueResults.environmental?.tick,
      issueResults.planning?.tick,
    ].some(Boolean);

    if (!anyTicked) {
      this.logger.log('[INSPECTION] No relevant issues ticked — skipping Claude call');
      return this.allFalse();
    }

    try {
      const skill = this.claudeVision.loadSkill('se-inspection.md');

      const zoneLayer = ctx.apiData.layers?.find(l => l.layerName === 'Land Zoning Map' && l.results?.length);
      const zoneCode = (zoneLayer?.results?.[0] as Record<string, string> | undefined)?.['Zone'] ?? null;

      const payload: Record<string, unknown> = {
        task: 'evaluate_inspection',
        property_address: ctx.confirmedAddress,
        lot: ctx.meta.lot,
        plan: ctx.meta.plan,
        zone_code: zoneCode,
        ticked_issues: {
          access_constraints: issueResults.access_constraints?.tick
            ? { trigger: issueResults.access_constraints.trigger, confidence: issueResults.access_constraints.confidence }
            : null,
          easements: issueResults.easements?.tick
            ? { trigger: issueResults.easements.trigger, confidence: issueResults.easements.confidence }
            : null,
          environmental: issueResults.environmental?.tick
            ? { trigger: issueResults.environmental.trigger, confidence: issueResults.environmental.confidence }
            : null,
          planning: issueResults.planning?.tick
            ? { trigger: issueResults.planning.trigger, confidence: issueResults.planning.confidence }
            : null,
        },
      };

      const images = [{ label: 'Google Maps satellite context (zoom 15)', base64: ctx.contextBase64 }];

      const result = await this.claudeVision.callClaude(payload, images, skill, 'INSPECTION', 3000, 1500);

      return {
        inspection_access: toIssueResult((result['inspection_access'] ?? {}) as Record<string, unknown>),
        inspection_easement: toIssueResult((result['inspection_easement'] ?? {}) as Record<string, unknown>),
        inspection_environmental: toIssueResult((result['inspection_environmental'] ?? {}) as Record<string, unknown>),
        inspection_views: toIssueResult((result['inspection_views'] ?? {}) as Record<string, unknown>),
      };
    } catch (err: unknown) {
      this.logger.error(`[INSPECTION] Fatal: ${(err as Error).message}`);
      return this.allFalse();
    }
  }

  private allFalse() {
    return {
      inspection_access: { ...STUB },
      inspection_easement: { ...STUB },
      inspection_environmental: { ...STUB },
      inspection_views: { ...STUB },
    };
  }
}
