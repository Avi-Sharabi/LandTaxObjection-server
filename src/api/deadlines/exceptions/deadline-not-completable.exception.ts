import { DomainException } from '../../../common/exceptions/domain.exception';

export class DeadlineNotCompletableException extends DomainException {
  constructor(id: string) {
    super(
      'DEADLINE_NOT_COMPLETABLE',
      `Deadline ${id} is already completed or cancelled and cannot be marked as completed.`,
      409,
    );
  }
}
