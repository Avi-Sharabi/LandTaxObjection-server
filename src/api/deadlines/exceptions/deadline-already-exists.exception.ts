import { DomainException } from '../../../common/exceptions/domain.exception';

export class DeadlineAlreadyExistsException extends DomainException {
  constructor(entityId: string, deadlineType: string) {
    super(
      'DEADLINE_ALREADY_EXISTS',
      `An active deadline of type "${deadlineType}" already exists for entity ${entityId}.`,
      409,
    );
  }
}
