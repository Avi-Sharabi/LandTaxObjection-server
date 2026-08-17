import { DomainException } from '../../../common/exceptions/domain.exception';

/**
 * Replaces InvalidDisputeStatusException, which gated on the retired `appraisal` status.
 *
 * The appraisal writes decision_outcome, which gates the objection package and discriminates an
 * advisory close. Once the case is lodged that decision is part of the record of why it was
 * lodged, so it must not be rewritten.
 */
export class AppraisalAfterLodgementException extends DomainException {
  constructor(current: string) {
    super(
      'APPRAISAL_AFTER_LODGEMENT',
      `An appraisal cannot be recorded once the case has been lodged with the Valuer General ` +
        `(current status: '${current}').`,
      422,
    );
  }
}
