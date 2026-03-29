import { DomainException } from '../../../common/exceptions/domain.exception';

export class DisputeConstraintNotFoundException extends DomainException {
  constructor(id: string) {
    super('DISPUTE_CONSTRAINT_NOT_FOUND', `Dispute constraint ${id} not found`, 404);
  }
}
