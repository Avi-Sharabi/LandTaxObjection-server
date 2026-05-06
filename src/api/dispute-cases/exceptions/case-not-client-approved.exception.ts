import { DomainException } from 'src/common/exceptions/domain.exception';

export class CaseNotClientApprovedException extends DomainException {
  constructor(caseId: string) {
    super(
      'CASE_NOT_CLIENT_APPROVED',
      `Dispute case ${caseId} must have status CLIENT_APPROVED before it can be submitted to VG.`,
      403,
    );
  }
}
