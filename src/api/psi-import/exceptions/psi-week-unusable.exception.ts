import { DomainException } from 'src/common/exceptions/domain.exception';

/**
 * Raised when a week parses but cannot be trusted to import.
 *
 * Both cases would otherwise corrupt the resume marker rather than fail: a week whose records
 * carry a `download_datetime` that does not render back to its anchor label would advance
 * `MAX(download_datetime)` to a string absent from the listing, making `selectNewerThan` fall
 * through and re-import every published week on every run; a week that yields files but no records
 * would advance the marker past data that never landed.
 */
export class PsiWeekUnusableException extends DomainException {
  constructor(label: string, reason: string) {
    super(
      'PSI_WEEK_UNUSABLE',
      `Weekly sales bundle ${label} cannot be imported — ${reason}`,
      502,
    );
  }
}
