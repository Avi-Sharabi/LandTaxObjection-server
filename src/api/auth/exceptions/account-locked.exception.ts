import { DomainException } from '../../../common/exceptions/domain.exception';

export class AccountLockedException extends DomainException {
  constructor() {
    super(
      'ACCOUNT_LOCKED',
      'Too many failed login attempts. Please try again later.',
      429,
    );
  }
}

