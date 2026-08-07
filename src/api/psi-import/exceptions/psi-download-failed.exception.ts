import { DomainException } from 'src/common/exceptions/domain.exception';

/** Raised when a weekly archive cannot be fetched or written to disk. */
export class PsiDownloadFailedException extends DomainException {
  constructor(url: string, reason: string) {
    super(
      'PSI_DOWNLOAD_FAILED',
      `Failed to download weekly sales archive from ${url} — ${reason}`,
      502,
    );
  }
}
