import { DomainException } from '../../../common/exceptions/domain.exception';

export class ResetTokenAlreadyUsedException extends DomainException {
  constructor() {
    super('RESET_TOKEN_ALREADY_USED', 'This password reset link has already been used', 400);
  }
}
