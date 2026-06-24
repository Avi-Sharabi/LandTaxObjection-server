import { DomainException } from '../../../common/exceptions/domain.exception';

export class ValuationReportFailedException extends DomainException {
  constructor(reason: string) {
    super('VALUATION_REPORT_FAILED', reason, 500);
  }
}
