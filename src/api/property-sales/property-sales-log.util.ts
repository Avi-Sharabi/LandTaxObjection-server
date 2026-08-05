import type { Logger } from '@nestjs/common';

import type { describePropertySalesError } from './exceptions/describe-property-sales-error';

type DescribedError = ReturnType<typeof describePropertySalesError>;

/**
 * The one JSON-structured-log shape used throughout property-sales:
 * `{ context, ...data, ts }`. Previously copy-pasted identically in
 * property-sales.service.ts, archive-ingestion.ts, and
 * source-discovery.service.ts — kept as a shared function, not a shared
 * logger instance, so each caller still logs through its own `Logger`
 * channel.
 */
export function logEvent(
  logger: Logger,
  context: string,
  data: Record<string, unknown>,
): void {
  logger.log(
    JSON.stringify({ context, ...data, ts: new Date().toISOString() }),
  );
}

/**
 * Same shape as `logEvent`, plus the `describePropertySalesError(...)` result
 * merged in as `errorCode`/`errorMessage`/(optional)`errorContext`. `extra`
 * lets a caller attach fields specific to what failed (e.g. `archiveFilename`)
 * without duplicating the error-shape logic per call site.
 */
export function logDescribedError(
  logger: Logger,
  context: string,
  described: DescribedError,
  extra: Record<string, unknown> = {},
): void {
  logger.error(
    JSON.stringify({
      context,
      ...extra,
      errorCode: described.code,
      errorMessage: described.message,
      ...(described.context ? { errorContext: described.context } : {}),
      ts: new Date().toISOString(),
    }),
  );
}
