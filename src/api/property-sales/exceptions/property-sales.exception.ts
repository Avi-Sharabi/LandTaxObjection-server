import { DomainException } from '../../../common/exceptions/domain.exception';

export type PropertySalesErrorCode =
  | 'DISCOVERY_FAILED'
  | 'DOWNLOAD_FAILED'
  | 'DOWNLOAD_BLOCKED'
  | 'DOWNLOAD_TOO_LARGE'
  | 'ARCHIVE_INVALID'
  | 'ARCHIVE_LIMIT_EXCEEDED'
  | 'PARSE_FAILED'
  | 'UNEXPECTED';

export interface PropertySalesExceptionOptions {
  readonly context?: Record<string, unknown>;
  readonly cause?: unknown;
}

export abstract class PropertySalesException extends DomainException {
  readonly context?: Readonly<Record<string, unknown>>;

  protected constructor(
    code: PropertySalesErrorCode,
    message: string,
    options: PropertySalesExceptionOptions = {},
  ) {
    super(code, message, 502);
    if (options.context) {
      this.context = Object.freeze({ ...options.context });
    }
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
