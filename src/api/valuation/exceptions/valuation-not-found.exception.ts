import { DomainException } from '../../../common/exceptions/domain.exception';

export class ValuationNoticeNotFoundException extends DomainException {
  constructor(id: string) {
    super('VALUATION_NOTICE_NOT_FOUND', `Valuation notice #${id} not found`, 404);
  }
}
