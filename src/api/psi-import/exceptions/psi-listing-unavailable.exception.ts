import { DomainException } from 'src/common/exceptions/domain.exception';

/**
 * Raised when the weekly panel is missing or yields no parseable anchors.
 *
 * This must be loud rather than an empty result: "the page changed shape" and "we are already up
 * to date" would otherwise look identical, and the job would silently stop importing forever.
 */
export class PsiListingUnavailableException extends DomainException {
  constructor(reason: string) {
    super(
      'PSI_LISTING_UNAVAILABLE',
      `Could not read the weekly sales listing from the NSW Valuer General site — ${reason}`,
      502,
    );
  }
}
