import { DomainException } from 'src/common/exceptions/domain.exception';

export class AdvisoryLetterEmailFailedException extends DomainException {
  constructor(caseReference: string, cause: string) {
    super(
      'ADVISORY_LETTER_EMAIL_FAILED',
      `Advisory letter email failed for case ${caseReference}: ${cause}`,
      500,
    );
  }
}
