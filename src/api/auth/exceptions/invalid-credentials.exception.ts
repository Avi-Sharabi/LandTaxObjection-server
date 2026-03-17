import { DomainException } from '../../../common/exceptions/domain.exception';

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }
}
