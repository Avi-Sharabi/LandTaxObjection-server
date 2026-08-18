import { DomainException } from 'src/common/exceptions/domain.exception';

export class FurtherSubmissionLimitReachedException extends DomainException {
  constructor(id: string, max: number) {
    super(
      'FURTHER_SUBMISSION_LIMIT_REACHED',
      `Dispute case #${id} has already used its ${max} further submissions — manual escalation is required.`,
      409,
    );
  }
}
