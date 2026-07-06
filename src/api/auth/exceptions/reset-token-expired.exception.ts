import { DomainException } from '../../../common/exceptions/domain.exception';

export class ResetTokenExpiredException extends DomainException {
  constructor() {
    super('RESET_TOKEN_EXPIRED', 'This password reset link has expired', 400);
  }
}
