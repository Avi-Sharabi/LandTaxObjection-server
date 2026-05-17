import { DomainException } from 'src/common/exceptions/domain.exception';

export class CaseAlreadySubmittedException extends DomainException {
  constructor(id: string) {
    super(
      'CASE_ALREADY_SUBMITTED',
      `Dispute case #${id} has already been submitted to the VG.`,
      409,
    );
  }
}
