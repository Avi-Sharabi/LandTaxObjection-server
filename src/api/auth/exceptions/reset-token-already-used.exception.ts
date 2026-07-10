import { DomainException } from '../../../common/exceptions/domain.exception';

export class ResetTokenAlreadyUsedException extends DomainException {
  constructor() {
    super(
      'RESET_TOKEN_ALREADY_USED',
      "This reset link was already used. If this was you, you can log in with your new password. If you didn't do this, please contact support immediately.",
      400,
      'Your password has already been changed',
    );
  }
}
