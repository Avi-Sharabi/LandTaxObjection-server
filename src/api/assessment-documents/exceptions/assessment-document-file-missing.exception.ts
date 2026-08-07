import { DomainException } from '../../../common/exceptions/domain.exception';

export class AssessmentDocumentFileMissingException extends DomainException {
  constructor(id: string) {
    super(
      'ASSESSMENT_DOCUMENT_FILE_MISSING',
      `Assessment document ${id} has no stored file`,
      404,
    );
  }
}
