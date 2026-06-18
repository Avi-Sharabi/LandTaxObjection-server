import { DomainException } from '../../../common/exceptions/domain.exception';

export class DisputeCaseNotFoundException extends DomainException {
  constructor(disputeCaseId: string) {
    super('DISPUTE_CASE_NOT_FOUND', `Dispute case ${disputeCaseId} not found`, 404);
  }
}
