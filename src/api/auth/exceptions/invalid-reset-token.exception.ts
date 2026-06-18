import { DomainException } from '../../../common/exceptions/domain.exception';

export class InvalidResetTokenException extends DomainException {
  constructor() {
    super('INVALID_RESET_TOKEN', 'Invalid or expired password reset token', 400);
  }
}
