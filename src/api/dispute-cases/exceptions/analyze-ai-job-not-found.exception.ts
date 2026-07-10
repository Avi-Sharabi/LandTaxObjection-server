import { DomainException } from '../../../common/exceptions/domain.exception';

export class AnalyzeAiJobNotFoundException extends DomainException {
  constructor(disputeCaseId: string) {
    super('ANALYZE_AI_JOB_NOT_FOUND', `Analyze-AI job for case ${disputeCaseId} not found`, 404);
  }
}
