/**
 * Pure formatting helpers shared by DisputeCasesService and DisputeStatusTransitionService.
 *
 * Extracted when the lifecycle transitions moved into the transition service: both needed the same
 * address and date formatting, and a second copy of either would eventually drift. Both services
 * import from here — do not reintroduce a private copy in either.
 */

interface AddressParts {
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
}

export function buildPropertyAddress(
  property: AddressParts | null | undefined,
): string {
  if (!property) return 'Address not available';
  return [property.address, property.suburb, property.state, property.postcode]
    .filter(Boolean)
    .join(', ');
}

export function formatAud(value: number): string {
  return `$${value.toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** en-AU long date + time, the format the advisory and VG emails already use. */
export function formatAuDateTime(date: Date, timeZone?: string): string {
  return date.toLocaleString('en-AU', {
    ...(timeZone ? { timeZone } : {}),
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// appendNote lived here until 1786000000000 dropped dispute_cases.vg_response_notes, the only
// append-only column it served. Every note is now one audit row (audit_logs.notes), so appending
// to a blob has no remaining caller — do not reintroduce it.
