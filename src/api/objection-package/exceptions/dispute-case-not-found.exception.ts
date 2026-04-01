import { DomainException } from '../../../common/exceptions/domain.exception';

export class DisputeCaseNotFoundException extends DomainException {
  constructor(id: string) {
    super('DISPUTE_CASE_NOT_FOUND', `Dispute case ${id} not found`, 404);
  }
}
