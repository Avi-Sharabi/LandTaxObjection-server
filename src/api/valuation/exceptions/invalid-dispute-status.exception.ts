import { DomainException } from '../../../common/exceptions/domain.exception';

export class InvalidDisputeStatusException extends DomainException {
  constructor(current: string) {
    super(
      'INVALID_DISPUTE_STATUS',
      `Appraisal can only be submitted when dispute status is 'appraisal', current status: '${current}'`,
      422,
    );
  }
}
