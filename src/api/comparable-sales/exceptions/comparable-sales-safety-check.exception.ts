import { DomainException } from '../../../common/exceptions/domain.exception';

export class ComparableSalesSafetyCheckException extends DomainException {
  constructor(reason: string) {
    super('COMPARABLE_SALES_SAFETY_CHECK', `Safety check failed: ${reason}`, 500);
  }
}
