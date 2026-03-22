import { DomainException } from '../../../common/exceptions/domain.exception';

export class FutureSaleDateException extends DomainException {
  constructor(date: string) {
    super(
      'FUTURE_SALE_DATE',
      `Sale date ${date} cannot be in the future`,
      400,
    );
  }
}
