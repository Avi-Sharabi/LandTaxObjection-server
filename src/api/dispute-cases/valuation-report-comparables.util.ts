import { Logger } from '@nestjs/common';
import { ComparableSale } from '../comparables/entities/comparable-sale.entity';

const logger = new Logger('valuation-report-comparables.util');

export interface ComparableRefMatch {
  comparable: ComparableSale;
  quarantineReason: string | null;
}

/**
 * Assigns each fetched comparable a stable "C1".."Cn" label (fetch order) so the LLM's echoed
 * comparables[] rows can be correlated back to the exact DB record it was shown — this is what
 * lets overrideComparableSalePrice force-populate the real price rather than trust the model's
 * transcription of it.
 */
export function assignComparableRefs(
  comparables: ComparableSale[],
  quarantineReasonByComparable: Map<ComparableSale, string>,
): Map<string, ComparableRefMatch> {
  return new Map(
    comparables.map((c, i) => [
      `C${i + 1}`,
      { comparable: c, quarantineReason: quarantineReasonByComparable.get(c) ?? null },
    ] as const),
  );
}

function moneyOrDash(n: number | null | undefined): string {
  return n != null && isFinite(n) ? '$' + Math.round(n).toLocaleString('en-AU') : '-';
}

/**
 * Force-populates the real sale price and quarantine flag for an LLM-authored comparable row —
 * mirrors the contended_value / meta override pattern already used elsewhere in
 * ValuationReportService.buildRenderData: never trust the model's transcription of a hard DB
 * fact, even one it was shown correctly in the prompt. An unmatched ref (invented row, or a ref
 * we never issued) renders "-", never a fabricated number.
 */
export function overrideComparableSalePrice<
  T extends { ref?: string; quarantined?: boolean; quarantine_reason?: string },
>(row: T, comparableByRef: Map<string, ComparableRefMatch>): T & {
  sale_price: number | null;
  sale_price_display: string;
  quarantined: boolean;
  quarantine_reason: string | undefined;
} {
  const match = row.ref != null ? comparableByRef.get(row.ref) : undefined;
  if (match === undefined) {
    // Safe failure mode (never fabricates a price), but silent otherwise — log so an unresolved
    // ref (the model didn't echo "C1" verbatim, or invented a row) is operationally visible
    // rather than only showing up as a blank "-" cell in a rendered report.
    logger.warn(`Comparable ref "${row.ref}" did not match any known comparable — rendering "-" for sale price/quarantine status.`);
  }
  const realPurchasePrice = match?.comparable.purchase_price != null
    ? Number(match.comparable.purchase_price)
    : null;
  const quarantineReason = match?.quarantineReason ?? undefined;
  return {
    ...row,
    sale_price: realPurchasePrice,
    sale_price_display: moneyOrDash(realPurchasePrice),
    quarantined: quarantineReason != null,
    quarantine_reason: quarantineReason,
  };
}
