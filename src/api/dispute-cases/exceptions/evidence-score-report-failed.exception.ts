import { DomainException } from '../../../common/exceptions/domain.exception';

// Distinct from ValuationReportFailedException so a log line or an alert can triage the two report
// generators apart — they share a template stack, a PDF renderer and a blob prefix, so a single
// exception type would make a failure impossible to attribute without reading the surrounding logs.
export class EvidenceScoreReportFailedException extends DomainException {
  constructor(reason: string) {
    super('EVIDENCE_SCORE_REPORT_FAILED', reason, 500);
  }
}
