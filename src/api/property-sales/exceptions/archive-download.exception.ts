import {
  PropertySalesException,
  type PropertySalesExceptionOptions,
} from './property-sales.exception';

export type DownloadErrorCode =
  | 'DOWNLOAD_FAILED'
  | 'DOWNLOAD_BLOCKED'
  | 'DOWNLOAD_TOO_LARGE';

export class ArchiveDownloadException extends PropertySalesException {
  constructor(
    code: DownloadErrorCode,
    message: string,
    options: PropertySalesExceptionOptions = {},
  ) {
    super(code, message, options);
  }
}
