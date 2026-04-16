import { DomainException } from 'src/common/exceptions/domain.exception';

export class ClientEmailMissingException extends DomainException {
  constructor(caseReference: string) {
    super(
      'CLIENT_EMAIL_MISSING',
      `Cannot send advisory letter: client on case ${caseReference} has no email address.`,
      422,
    );
  }
}
