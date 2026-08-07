import { DomainException } from '../../../common/exceptions/domain.exception';

export class AssessmentDocumentNotFoundException extends DomainException {
  constructor(id: string) {
    super(
      'ASSESSMENT_DOCUMENT_NOT_FOUND',
      `Assessment document ${id} not found`,
      404,
    );
  }
}
