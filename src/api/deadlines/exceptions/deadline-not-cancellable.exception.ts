import { DomainException } from '../../../common/exceptions/domain.exception';

export class DeadlineNotCancellableException extends DomainException {
  constructor(id: string) {
    super(
      'DEADLINE_NOT_CANCELLABLE',
      `Deadline ${id} is already completed or cancelled and cannot be cancelled.`,
      409,
    );
  }
}
