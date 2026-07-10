import { DomainException } from '../../../common/exceptions/domain.exception';

export class InvalidResetTokenException extends DomainException {
  constructor() {
    super(
      'INVALID_RESET_TOKEN',
      'This password reset link is invalid. Please request a new one.',
      400,
      'Invalid reset link',
    );
  }
}
