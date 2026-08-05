import {
  PropertySalesException,
  type PropertySalesExceptionOptions,
} from './property-sales.exception';

export type ArchiveErrorCode = 'ARCHIVE_INVALID' | 'ARCHIVE_LIMIT_EXCEEDED';

export class ArchiveExtractionException extends PropertySalesException {
  constructor(
    code: ArchiveErrorCode,
    message: string,
    options: PropertySalesExceptionOptions = {},
  ) {
    super(code, message, options);
  }
}
