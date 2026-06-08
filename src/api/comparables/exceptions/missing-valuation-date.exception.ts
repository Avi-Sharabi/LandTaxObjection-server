import { DomainException } from '../../../common/exceptions/domain.exception';

export class MissingValuationDateException extends DomainException {
  constructor(disputeCaseId: string) {
    super('MISSING_VALUATION_DATE', `Valuation notice for dispute case ${disputeCaseId} has no valuation_date`, 422);
  }
}
