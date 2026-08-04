import { DomainException } from '../../common/exceptions/domain.exception';

/**
 * Typed failure codes for the property-sales ingestion pipeline: discover
 * -> download -> unzip -> parse, ending before any database write. Ported
 * from nsw-property-sales-poc/src/errors.ts, pruned to drop everything
 * belonging to persistence and the ledger/queue/retention machinery this
 * pipeline deliberately does not have (DB_*, VERIFY_*, REPORTS_*,
 * RECONCILE_*, WORKSPACE_*, DOWNLOAD_INSUFFICIENT_DISK,
 * VALIDATION_THRESHOLD_EXCEEDED — a rejected sale row is reported, not
 * treated as a whole-archive abort; see dat-parser.ts). KAN-242 adds its
 * own codes for the INSERT step.
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

  // Archive-entry safety (see archive-extractor.ts)
  'ENTRY_ABSOLUTE_PATH',
  'ENTRY_PATH_TRAVERSAL',
  'ENTRY_ILLEGAL_CHARACTER',
  'ENTRY_UNC_PATH',
  'ENTRY_DRIVE_LETTER',
  'ENTRY_EMPTY_NAME',
  'ENTRY_RESERVED_NAME',
  'ENTRY_NOT_REGULAR_FILE',
  'ENTRY_SYMLINK',
  'ENTRY_DUPLICATE_NAME',
  'ENTRY_TOO_LARGE',
  'ENTRY_RATIO_EXCEEDED',
  'ENTRY_SIZE_MISMATCH',
  'ENTRY_ESCAPES_DESTINATION',

  // Archive-level safety (see archive-extractor.ts)
  'ARCHIVE_UNREADABLE',
  'ARCHIVE_TOO_MANY_ENTRIES',
  'ARCHIVE_TOTAL_TOO_LARGE',
  'ARCHIVE_NO_DAT_FILES',

  // Parsing (see dat-parser.ts) — a structural failure (corruption or an
  // undocumented format change), fatal for the whole .dat file. A single
  // bad sale ROW is not one of these; it is coerced independently and
  // reported as a rejection instead.
  'PARSE_UNKNOWN_RECORD_TYPE',
  'PARSE_FIELD_COUNT_MISMATCH',
  'PARSE_MISSING_HEADER',
  'PARSE_MISSING_TRAILER',
  'PARSE_TRAILER_MISMATCH',

  'UNEXPECTED',
] as const;

export type PropertySalesErrorCode =
  (typeof PROPERTY_SALES_ERROR_CODES)[number];

/**
 * An error with a stable machine-readable code and structured context,
 * rendered by the repo's already-global `DomainExceptionFilter` — see
 * src/common/filters/domain-exception.filter.ts and src/main.ts.
 *
 * Defaults to 502 (Bad Gateway): almost every code here represents a
 * failure reaching or validating the external NSW source, not a client
 * input error.
 */
export class PropertySalesIngestionException extends DomainException {
  readonly context: Readonly<Record<string, unknown>>;

  constructor(
    code: PropertySalesErrorCode,
    message: string,
    options?: {
      statusCode?: number;
      context?: Record<string, unknown>;
      cause?: unknown;
    },
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
  return isPropertySalesIngestionException(value)
    ? (value.code as PropertySalesErrorCode)
    : 'UNEXPECTED';
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
      ...(Object.keys(value.context).length > 0
        ? { context: { ...value.context } }
        : {}),
    };
  }
  if (value instanceof Error) {
    return { code: 'UNEXPECTED', message: value.message };
  }
  return { code: 'UNEXPECTED', message: String(value) };
}
