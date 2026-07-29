import { DomainException } from '../../../common/exceptions/domain.exception';

export class CaseReferenceGenerationFailedException extends DomainException {
  constructor() {
    // Deliberately no caller-supplied detail in the message — the underlying DB/driver error is
    // logged server-side by the caller; this reaches an unauthenticated public endpoint via
    // DomainExceptionFilter, which forwards `message` verbatim in the response body.
    super('CASE_REFERENCE_GENERATION_FAILED', 'Failed to generate a case reference. Please try again.', 500);
  }
}
