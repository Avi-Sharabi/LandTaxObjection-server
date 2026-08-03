import { DomainException } from '../../../common/exceptions/domain.exception';

/**
 * Typed failure codes for the property-sales download pipeline (KAN-241).
 * Ported from nsw-property-sales-poc/src/errors.ts, pruned to what this
 * ticket's download-only scope actually uses — the DAT-parsing codes
 * (PARSE_*, VALIDATION_THRESHOLD_EXCEEDED, DB_IMPORT_FAILED, etc.) belong to
 * KAN-242 and are added there, not here.
 */
export const PROPERTY_SALES_ERROR_CODES = [
  // Discovery
  'DISCOVERY_NO_CANDIDATES',
  'DISCOVERY_BLOCKED',
  'DISCOVERY_FAILED',

  // Download
  'DOWNLOAD_HOST_NOT_ALLOWED',
  'DOWNLOAD_SCHEME_NOT_ALLOWED',
  'DOWNLOAD_TOO_LARGE',
  'DOWNLOAD_BLOCKED',
  'DOWNLOAD_FAILED',
  'DOWNLOAD_INSUFFICIENT_DISK',
  'DOWNLOAD_ABANDONED',

  // Archive-level safety (entry-level ENTRY_* codes are KAN-242's concern —
  // extraction is not in scope here — but mapZipFileError in
  // zip-inspector.util.ts can surface these three even during the
  // read-only validation this ticket does perform)
  'ARCHIVE_UNREADABLE',
  'ENTRY_ABSOLUTE_PATH',
  'ENTRY_PATH_TRAVERSAL',
  'ENTRY_ILLEGAL_CHARACTER',

  // Storage / cleanup safety
  'WORKSPACE_UNSAFE_DELETE',
  'WORKSPACE_UNRESOLVABLE',

  // Control flow (not failures)
  'SKIPPED_CONCURRENT',

  'UNEXPECTED',
] as const;

export type PropertySalesErrorCode = (typeof PROPERTY_SALES_ERROR_CODES)[number];

/**
 * An error with a stable machine-readable code and structured context,
 * rendered by the repo's already-global `DomainExceptionFilter` — see
 * src/common/filters/domain-exception.filter.ts and src/main.ts.
 *
 * Defaults to 502 (Bad Gateway): almost every code here represents a failure
 * reaching or validating the external NSW source, not a client input error.
 * Callers needing a different status (e.g. a 400 on a bad admin-endpoint
 * body) pass `statusCode` explicitly.
 */
export class PropertySalesIngestionException extends DomainException {
  readonly context: Readonly<Record<string, unknown>>;

  constructor(
    code: PropertySalesErrorCode,
    message: string,
    options?: { statusCode?: number; context?: Record<string, unknown>; cause?: unknown },
  ) {
    super(code, message, options?.statusCode ?? 502);
    this.context = Object.freeze({ ...options?.context });
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isPropertySalesIngestionException(
  value: unknown,
): value is PropertySalesIngestionException {
  return value instanceof PropertySalesIngestionException;
}

/** Best-effort code extraction for anything thrown at us. */
export function errorCodeOf(value: unknown): PropertySalesErrorCode {
  return isPropertySalesIngestionException(value) ? (value.code as PropertySalesErrorCode) : 'UNEXPECTED';
}

/** Normalises an unknown thrown value into something loggable (JSON-safe). */
export function describeError(value: unknown): {
  code: PropertySalesErrorCode;
  message: string;
  context?: Record<string, unknown>;
} {
  if (isPropertySalesIngestionException(value)) {
    return {
      code: value.code as PropertySalesErrorCode,
      message: value.message,
      ...(Object.keys(value.context).length > 0 ? { context: { ...value.context } } : {}),
    };
  }
  if (value instanceof Error) {
    return { code: 'UNEXPECTED', message: value.message };
  }
  return { code: 'UNEXPECTED', message: String(value) };
}
