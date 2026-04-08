import { DomainException } from 'src/common/exceptions/domain.exception';

export class AccountantNotFoundException extends DomainException {
  constructor(accountantId: string) {
    super('ACCOUNTANT_NOT_FOUND', `Accountant with ID ${accountantId} does not exist`, 400);
  }
}
