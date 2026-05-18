import { DomainException } from 'src/common/exceptions/domain.exception';

export class CaseNotClientApprovedException extends DomainException {
  constructor(id: string) {
    super(
      'CASE_NOT_CLIENT_APPROVED',
      `Dispute case #${id} must be in CLIENT_APPROVED status before submitting to the VG.`,
      422,
    );
  }
}
