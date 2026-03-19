import { DomainException } from '../../../common/exceptions/domain.exception';

export const MINIMUM_COMPARABLES = 3;

export class InsufficientComparablesException extends DomainException {
  constructor(current: number) {
    super(
      'INSUFFICIENT_COMPARABLES',
      `At least ${MINIMUM_COMPARABLES} comparable sales are required to progress to valuation appraisal. Currently have ${current}.`,
      422,
    );
  }
}
