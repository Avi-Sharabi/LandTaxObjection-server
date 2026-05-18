import { DomainException } from 'src/common/exceptions/domain.exception';

export class CaseAlreadySubmittedException extends DomainException {
  constructor(caseId: string) {
    super('CASE_ALREADY_SUBMITTED', `Dispute case #${caseId} has already been submitted to VG`, 409);
  }
}
