import { DomainException } from '../../../common/exceptions/domain.exception';

export class ResetTokenExpiredException extends DomainException {
  constructor() {
    super(
      'RESET_TOKEN_EXPIRED',
      'Password reset links are valid for 15 minutes. Please request a new one.',
      400,
      'This link has expired',
    );
  }
}
