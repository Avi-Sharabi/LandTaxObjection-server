import { DomainException } from '../../../common/exceptions/domain.exception';

export class ObjectionPackageNotReadyException extends DomainException {
  constructor() {
    super(
      'OBJECTION_PACKAGE_NOT_READY',
      'Objection package is not yet available for this dispute case.',
      403,
    );
  }
}
